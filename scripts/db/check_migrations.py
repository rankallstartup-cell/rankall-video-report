#!/usr/bin/env python3
"""Rankall migration safety checker.

Every file in supabase/migrations/ must be SAFE TO RUN AGAIN (idempotent):
our databases were partly built by hand, so a migration can meet objects
that already exist. Running a migration twice must never fail and never
change anything the first run did not.

Run:   npm run db:check            (or: python3 scripts/db/check_migrations.py)
Needs: pip install pglast==7.*

Exit code 0 = all good, 1 = problems found (CI blocks the merge).
See supabase/README.md for the rules and how to fix each message.
"""
from __future__ import annotations

import os
import re
import sys
from collections import Counter

try:
    from pglast import ast, parse_sql
    from pglast.enums import AlterTableType, ObjectType
except ImportError:  # pragma: no cover
    sys.exit("check_migrations: install the SQL parser first:  pip install 'pglast>=7,<8'")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIG_DIR = os.path.join(ROOT, "supabase", "migrations")
NAME_RE = re.compile(r"^(\d{14})_[a-z0-9_]+\.sql$")
RERUN_SAFE_RE = re.compile(r"--\s*rerun-safe:\s*\S", re.I)
REVIEWED_RE = re.compile(r"--\s*reviewed:\s*\S", re.I)


def relname(rv) -> str:
    return f"{rv.schemaname + '.' if rv.schemaname else ''}{rv.relname}"


def drop_names(s: ast.DropStmt):
    """Yield (table, name) or (None, name) for each object a DROP names."""
    for obj in s.objects or []:
        parts = []
        items = obj if isinstance(obj, tuple) else getattr(obj, "objname", None) or (obj,)
        for p in items if isinstance(items, tuple) else (items,):
            if isinstance(p, ast.String):
                parts.append(p.sval)
            elif isinstance(p, tuple):
                parts += [x.sval for x in p if isinstance(x, ast.String)]
        if parts:
            yield (".".join(parts[:-1]) or None, parts[-1])


def check_file(path: str) -> list[str]:
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    problems: list[str] = []

    def bad(msg: str) -> None:
        problems.append(msg)

    try:
        stmts = parse_sql(src)
    except Exception as e:  # syntax error
        return [f"SQL syntax error: {e}"]

    dropped_policies: set[tuple[str, str]] = set()
    dropped_triggers: set[tuple[str, str]] = set()
    dropped_constraints: set[tuple[str, str]] = set()
    has_data_change = False

    for rs in stmts:
        s = rs.stmt
        # The statement's own text, including the comments right above it. A
        # "-- reviewed:" note only counts for the statement it is written over.
        chunk = src[rs.stmt_location: rs.stmt_location + (rs.stmt_len or len(src))]
        reviewed = bool(REVIEWED_RE.search(chunk))
        if isinstance(s, ast.TransactionStmt):
            bad("remove BEGIN/COMMIT/ROLLBACK - each migration already runs in its own transaction")
        elif isinstance(s, ast.CreateStmt):
            if not s.if_not_exists:
                bad(f"CREATE TABLE {relname(s.relation)} -> use CREATE TABLE IF NOT EXISTS")
        elif isinstance(s, ast.IndexStmt):
            if not s.idxname:
                bad(f"CREATE INDEX on {relname(s.relation)} needs a name (so IF NOT EXISTS works)")
            elif not s.if_not_exists:
                bad(f"CREATE INDEX {s.idxname} -> use CREATE INDEX IF NOT EXISTS")
            if s.concurrent:
                bad(f"CREATE INDEX CONCURRENTLY {s.idxname} cannot run inside a migration transaction")
        elif isinstance(s, ast.AlterTableStmt):
            t = relname(s.relation)
            for c in s.cmds or []:
                st = c.subtype
                if st == AlterTableType.AT_AddColumn and not c.missing_ok:
                    bad(f"ALTER TABLE {t} ADD COLUMN {c.def_.colname} -> use ADD COLUMN IF NOT EXISTS")
                elif st == AlterTableType.AT_DropColumn:
                    if not c.missing_ok:
                        bad(f"ALTER TABLE {t} DROP COLUMN {c.name} -> use DROP COLUMN IF EXISTS")
                    if not reviewed:
                        bad(f"ALTER TABLE {t} DROP COLUMN {c.name} deletes data -> add a '-- reviewed: <why safe>' comment above it")
                elif st == AlterTableType.AT_DropConstraint:
                    if not c.missing_ok:
                        bad(f"ALTER TABLE {t} DROP CONSTRAINT {c.name} -> use DROP CONSTRAINT IF EXISTS")
                    dropped_constraints.add((s.relation.relname, c.name))
                elif st == AlterTableType.AT_AddConstraint:
                    cn = getattr(c.def_, "conname", None)
                    if not cn:
                        bad(f"ALTER TABLE {t} ADD CONSTRAINT needs a name")
                    elif (s.relation.relname, cn) not in dropped_constraints:
                        bad(f"ALTER TABLE {t} ADD CONSTRAINT {cn} -> put "
                            f"'ALTER TABLE {t} DROP CONSTRAINT IF EXISTS {cn};' before it")
                elif st in (AlterTableType.AT_AlterColumnType,) and not reviewed:
                    bad(f"ALTER TABLE {t} ALTER COLUMN TYPE can lose data -> add a '-- reviewed: <why safe>' comment")
        elif isinstance(s, ast.RenameStmt):
            if not s.missing_ok and not reviewed:
                bad("RENAME is not safe to run twice -> wrap it in a DO block that checks first, "
                    "and add a '-- reviewed: <why safe>' comment")
        elif isinstance(s, ast.CreatePolicyStmt):
            # A policy that allows everything (USING/WITH CHECK true) with no TO
            # role applies to anon and every signed-in user.
            is_open = any(isinstance(x, ast.A_Const) and getattr(x.val, "boolval", None) is True
                          for x in (s.qual, s.with_check) if x is not None)
            roles = [getattr(r, "rolename", None) for r in (s.roles or [])]
            if is_open and (not roles or roles == [None] or "public" in roles) and not reviewed:
                bad(f"CREATE POLICY \"{s.policy_name}\" allows everything for EVERY role -> add "
                    f"'TO service_role' (or the intended role), or a '-- reviewed: <why public>' comment")
            key = (s.table.relname, s.policy_name)
            if key not in dropped_policies:
                bad(f"CREATE POLICY \"{s.policy_name}\" ON {relname(s.table)} -> put "
                    f"'DROP POLICY IF EXISTS \"{s.policy_name}\" ON {relname(s.table)};' before it")
        elif isinstance(s, ast.AlterPolicyStmt):
            bad(f"ALTER POLICY \"{s.policy_name}\" fails if the policy is missing -> "
                f"use DROP POLICY IF EXISTS + CREATE POLICY instead")
        elif isinstance(s, ast.CreateFunctionStmt):
            if not s.replace:
                bad("CREATE FUNCTION -> use CREATE OR REPLACE FUNCTION")
        elif isinstance(s, ast.CreateTrigStmt):
            key = (s.relation.relname, s.trigname)
            if not s.replace and key not in dropped_triggers:
                bad(f"CREATE TRIGGER {s.trigname} -> use CREATE OR REPLACE TRIGGER, "
                    f"or DROP TRIGGER IF EXISTS first")
        elif isinstance(s, ast.ViewStmt):
            if not s.replace:
                bad(f"CREATE VIEW {relname(s.view)} -> use CREATE OR REPLACE VIEW")
        elif isinstance(s, ast.CreateTableAsStmt):
            if not s.if_not_exists:
                bad("CREATE ... AS -> use IF NOT EXISTS")
        elif isinstance(s, ast.CreateExtensionStmt):
            if not s.if_not_exists:
                bad(f"CREATE EXTENSION {s.extname} -> use CREATE EXTENSION IF NOT EXISTS")
        elif isinstance(s, ast.CreateSchemaStmt):
            if not s.if_not_exists:
                bad(f"CREATE SCHEMA {s.schemaname} -> use CREATE SCHEMA IF NOT EXISTS")
        elif isinstance(s, ast.CreateEnumStmt):
            bad("CREATE TYPE ... AS ENUM fails if it exists -> create it inside a DO block "
                "that checks pg_type first (or use a text column + CHECK)")
        elif isinstance(s, ast.CreateSeqStmt):
            if not s.if_not_exists:
                bad("CREATE SEQUENCE -> use IF NOT EXISTS")
        elif isinstance(s, ast.DropStmt):
            if not s.missing_ok:
                bad("DROP ... -> use DROP ... IF EXISTS")
            if s.behavior and s.behavior.name == "DROP_CASCADE" and not reviewed:
                bad("DROP ... CASCADE also deletes everything that depends on it -> add a '-- reviewed: <why safe>' comment above it")
            if s.removeType == ObjectType.OBJECT_TABLE and not reviewed:
                bad("DROP TABLE deletes data -> add a '-- reviewed: <why safe>' comment")
            for tbl, name in drop_names(s):
                if s.removeType == ObjectType.OBJECT_POLICY and tbl:
                    dropped_policies.add((tbl.split(".")[-1], name))
                elif s.removeType == ObjectType.OBJECT_TRIGGER and tbl:
                    dropped_triggers.add((tbl.split(".")[-1], name))
        elif isinstance(s, ast.InsertStmt):
            if s.onConflictClause is None:
                has_data_change = True
        elif isinstance(s, (ast.UpdateStmt, ast.DeleteStmt, ast.TruncateStmt)):
            has_data_change = True
            if isinstance(s, ast.TruncateStmt) and not reviewed:
                bad("TRUNCATE deletes data -> add a '-- reviewed: <why safe>' comment")

    if has_data_change and not RERUN_SAFE_RE.search(src):
        bad("changes data (INSERT/UPDATE/DELETE) -> add a '-- rerun-safe: <why running it "
            "twice is harmless>' comment (INSERT ... ON CONFLICT does not need one)")
    return problems


def main(argv: list[str]) -> int:
    files = sorted(f for f in os.listdir(MIG_DIR) if f.endswith(".sql"))
    errors = 0
    versions = Counter()
    for f in files:
        m = NAME_RE.match(f)
        if not m:
            print(f"✗ {f}: bad file name -> must be <14-digit UTC timestamp>_<snake_case>.sql "
                  f"(create files with: npm run db:new -- <name>)")
            errors += 1
            continue
        versions[m.group(1)] += 1
    for v, n in versions.items():
        if n > 1:
            print(f"✗ version {v} is used by {n} files -> every file needs its own timestamp")
            errors += 1
    for f in files:
        probs = check_file(os.path.join(MIG_DIR, f))
        for p in probs:
            print(f"✗ {f}: {p}")
        errors += len(probs)
    if errors:
        print(f"\n{errors} problem(s) in supabase/migrations. Rules: supabase/README.md")
        return 1
    print(f"✓ {len(files)} migrations OK (names unique, all safe to run again)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
