#!/usr/bin/env python3
"""Unit tests for check_migrations.py — proves each rule catches what it should
and accepts the safe form.  Run: python3 scripts/db/test_check_migrations.py"""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import check_migrations as cm  # noqa: E402


def problems(sql: str) -> list[str]:
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False) as f:
        f.write(sql)
    try:
        return cm.check_file(f.name)
    finally:
        os.unlink(f.name)


class Rules(unittest.TestCase):
    def bad(self, sql, needle):
        p = problems(sql)
        self.assertTrue(any(needle in x for x in p), f"expected '{needle}' for:\n{sql}\ngot: {p}")

    def ok(self, sql):
        self.assertEqual(problems(sql), [], sql)

    def test_create_table(self):
        self.bad("create table t (id int);", "IF NOT EXISTS")
        self.ok("create table if not exists t (id int);")

    def test_index(self):
        self.bad("create index i on t(x);", "IF NOT EXISTS")
        self.bad("create index if not exists i on t(x); create index concurrently if not exists j on t(y);", "CONCURRENTLY")
        self.ok("create index if not exists i on t(x);")

    def test_add_column(self):
        self.bad("alter table t add column c int;", "ADD COLUMN IF NOT EXISTS")
        self.ok("alter table t add column if not exists c int;")

    def test_policy_needs_drop_first(self):
        self.bad('create policy "p" on t using (user_id = auth.uid());', "DROP POLICY IF EXISTS")
        self.bad('drop policy if exists "p" on other; create policy "p" on t using (user_id = auth.uid());', "DROP POLICY IF EXISTS")
        self.ok('drop policy if exists "p" on t; create policy "p" on t using (user_id = auth.uid());')
        self.ok('drop policy if exists "p" on public.t; create policy "p" on public.t using (user_id = auth.uid());')

    def test_open_policy_needs_a_role(self):
        self.bad('drop policy if exists "p" on t; create policy "p" on t for all using (true) with check (true);', "EVERY role")
        self.bad('drop policy if exists "p" on t; create policy "p" on t for insert to public with check (true);', "EVERY role")
        self.ok('drop policy if exists "p" on t; create policy "p" on t for all to service_role using (true);')
        self.ok('drop policy if exists "p" on t; create policy "p" on t for insert to anon, authenticated with check (true);')
        self.ok('drop policy if exists "p" on t; create policy "p" on t using (user_id = auth.uid());')

    def test_reviewed_note_is_per_statement(self):
        self.bad("-- reviewed: first one is fine\ndrop table if exists a;\ndrop table if exists b;", "DROP TABLE")
        self.ok("-- reviewed: a\ndrop table if exists a;\n-- reviewed: b\ndrop table if exists b;")

    def test_drop_column_and_cascade_need_review(self):
        self.bad("alter table t drop column if exists c;", "deletes data")
        self.ok("-- reviewed: column unused since v2\nalter table t drop column if exists c;")
        self.bad("drop function if exists f() cascade;", "CASCADE")

    def test_alter_policy(self):
        self.bad('alter policy "p" on t using (true);', "ALTER POLICY")

    def test_constraint_needs_drop_first(self):
        self.bad("alter table t add constraint c unique (x);", "DROP CONSTRAINT IF EXISTS")
        self.ok("alter table t drop constraint if exists c; alter table t add constraint c unique (x);")

    def test_function_and_trigger(self):
        self.bad("create function f() returns int language sql as 'select 1';", "OR REPLACE")
        self.ok("create or replace function f() returns int language sql as 'select 1';")
        self.bad("create trigger tg after insert on t for each row execute function f();", "TRIGGER")
        self.ok("drop trigger if exists tg on t; create trigger tg after insert on t for each row execute function f();")

    def test_drop_needs_if_exists_and_review(self):
        self.bad("drop index i;", "IF EXISTS")
        self.bad("drop table if exists t;", "reviewed")
        self.ok("-- reviewed: table was never used\ndrop table if exists t;")

    def test_transactions_forbidden(self):
        self.bad("begin; create table if not exists t (id int); commit;", "BEGIN/COMMIT")

    def test_enum(self):
        self.bad("create type mood as enum ('a','b');", "ENUM")

    def test_data_change_needs_rerun_safe(self):
        self.bad("update t set x = 1 where x is null;", "rerun-safe")
        self.ok("-- rerun-safe: only fills NULLs\nupdate t set x = 1 where x is null;")
        self.ok("insert into t (id) values (1) on conflict do nothing;")
        self.bad("insert into t (id) values (1);", "rerun-safe")

    def test_syntax_error(self):
        self.bad("create tabel t (id int);", "syntax error")

    def test_do_block_is_allowed(self):
        self.ok("do $$ begin if not exists (select 1) then create table t (id int); end if; end $$;")


class RepoFiles(unittest.TestCase):
    def test_every_repo_migration_passes(self):
        self.assertEqual(cm.main([]), 0)

    def test_baseline_lists_only_real_old_files(self):
        # The one-time baseline must name existing files, and must never grow:
        # anything created after the pipeline existed has to run for real.
        files = set(os.listdir(cm.MIG_DIR))
        bdir = os.path.join(cm.ROOT, "supabase", "migration-baseline")
        for env in ("staging", "production"):
            with open(os.path.join(bdir, f"{env}.txt"), encoding="utf-8") as fh:
                rows = [r.strip() for r in fh if r.strip() and not r.startswith("#")]
            self.assertTrue(rows, env)
            for r in rows:
                self.assertIn(r, files, f"{env}.txt names a file that does not exist: {r}")
                self.assertLess(r[:14], "20261017000000", f"{env}.txt must not list new migrations: {r}")


if __name__ == "__main__":
    unittest.main(verbosity=1)
