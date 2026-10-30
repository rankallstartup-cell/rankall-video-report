// ── Hackathon video-report pipeline CLI: scan JSON in, video out ───────
// Usage (tsx resolves the @/ alias from tsconfig.scripts.json):
//   npx tsx --tsconfig tsconfig.scripts.json scripts/generate-video-report.ts \
//     --scan <scan.json> --out <dir> [--avatar <id>] [--voice <id>]
//
// The scan JSON must be aggregates only (see lib/video/scanInput.ts —
// response_text is stripped even if present). Prints a JSON summary with
// the finished video path, per-stage latencies, and costs. Exits non-zero
// with the failing stage + cause on any honest failure.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sanitizeScanInput } from '@/lib/video/scanInput';
import { runVideoPipeline, PipelineError } from '@/lib/video/pipeline';

function usage(): never {
  console.error(
    'usage: generate-video-report.ts --scan <scan.json> --out <dir> [--avatar <id>] [--voice <id>]',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): { scan: string; out: string; avatar?: string; voice?: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) usage();
      args[key] = value;
      i++;
    }
  }
  if (!args.scan || !args.out) usage();
  return { scan: args.scan, out: args.out, avatar: args.avatar, voice: args.voice };
}

async function main(): Promise<void> {
  const { scan, out, avatar, voice } = parseArgs(process.argv.slice(2));
  const raw = JSON.parse(await readFile(resolve(scan), 'utf8')) as unknown;
  const input = sanitizeScanInput(raw);
  const result = await runVideoPipeline(input, {
    outDir: resolve(out),
    avatarId: avatar,
    voiceId: voice,
  });
  console.log(
    JSON.stringify(
      {
        businessName: result.businessName,
        scriptSource: result.scriptSource,
        videoPath: result.video.localPath,
        remoteVideoUrl: result.video.remoteVideoUrl,
        heygenVideoId: result.video.heygenVideoId,
        avatarId: result.video.avatarId,
        narrationCharacters: result.costs.elevenlabsCharacters,
        heygenSpentUsd: result.costs.heygenSpentUsd,
        overBudget: result.costs.overBudget,
        warnings: result.warnings,
        stages: result.stages,
        totalLatencyMs: result.totalLatencyMs,
        reportPath: result.reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch((err: unknown) => {
  if (err instanceof PipelineError) {
    console.error(`PIPELINE FAILED at stage "${err.stage}": ${err.message}`);
  } else {
    console.error(`PIPELINE FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
