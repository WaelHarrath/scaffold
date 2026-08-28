# SCAFFOLD Phase 10 — Research Integrity Manifest

**Date:** 2026-08-28
**Purpose:** Record immutable hashes of the frozen research artifacts and explicitly
declare the full set of Phase 10 working-tree changes, proving that the frozen
research record is preserved. This is a Phase 10 engineering deliverable; it does
**not** modify any frozen artifact.

## 1. Frozen research files — SHA-256 (unchanged)

All hashes below are computed on the current working tree. These files were
touched **only** by the earlier publication phase (no Phase 10 modification):

| File | SHA-256 |
|---|---|
| `FINAL-ARCHITECTURE.md` | `2296722ADA40ABC350E28BE235433EC6B735DE0A5ACF549FB0010074D55DF069` |
| `LIMITATIONS.md` | `46E61A941568C29CED381CF7E9E943C4F92CF5D423723825CCD10B45BBC25F43` |
| `REPRODUCIBILITY.md` | `9F0535A0D791383A69275387132B064CC5D70284AAF4138A1AE36A07A6E0B02D` |
| `src/execution/scaffold-loop.ts` | `C96F46366E680BB930BB296F6BFD5BDFD1CDF525A316C9A93E94783A193E46CB` |
| `src/execution/executor.ts` | `4CA8F85636DCC291C5467D3CAC300EB4CC58854F5EED42EB4AAB33CEE63FCBD8` |
| `src/execution/system-prompt.ts` | `ECFA0E51D1578AB6C0D7DE3FEDB7D4DA74DB019D43C398F7F1204451BEBE5936` |
| `src/model/types.ts` | `3FC7206CF021B82F0FF33DD5472DBE953405D96D3EF193D081D42BA9A631486C` |

### Benchmark research evidence — SHA-256 (unchanged)

| File | SHA-256 |
|---|---|
| `benchmarks/results/phase1/analysis.md` | `082EBEE2DE1D176132C05CD237C828EC23C826D6B4948606DFC6BCFF898C1D6B` |
| `benchmarks/results/phase1/checkpoint.json` | `97F50121E86F0B1FCC24B5256085E34DE17EE36F229E5196563D77CC8BA6BC43` |
| `benchmarks/results/phase1/results.json` | `16FE6A6452BAFADBBFBB13AF5AB3CCCDB40DB72D1EF3FFDA29EFAF045547C4D2` |
| `benchmarks/results/phase2/checkpoint.json` | `6A9B8278E44ED342E97DC584943494452ED61AB7F04BD053026A7AD3C2D0E9FC` |
| `benchmarks/results/phase2/results.json` | `9FEEB60CDCFA3DEA49CB8314BE5299B0DAAC850D2E4FC1D6368ED20629E26D0C` |
| `benchmarks/results/phase3/analysis.md` | `9ACDB5969FCE4F607F964B53A5D5CFB5CCB37CAC9D6775D00F6AE8D66DD98362` |
| `benchmarks/results/phase3/checkpoint.json` | `740116380FF9F7DAA276A6D125BF2CC1A25D33F1A29607F75B33733EA31423FB` |
| `benchmarks/results/phase3/results.json` | `B90EEC500600E27C1B7211B012CBD03AF7CB6EB5B1F87E84C0514C2B1D2E0AB2` |
| `benchmarks/results/phase4/analysis.md` | `E00A2EBF185440B9948351534CDD60996B6518D0E2297C5F3DF56BE1B2126D0D` |
| `benchmarks/results/phase4/checkpoint.json` | `F771A8139D8D08838A59B51849DD57AC2DDB37AFD7E755381F512DA0AFD5B296` |
| `benchmarks/results/phase4/minimal-stack.json` | `B7D11BB98142C91351005A5E9BD1D7A4C315729AF71F978B18504B09310CDFD5` |
| `benchmarks/results/phase4/results.json` | `D291861E186FF8893307A5A6887888828634D2F37AFEB25A5D38FA9082087EE3` |
| `benchmarks/results/phase6/analysis-all.md` | `FDF608108C487DFD8E5BF5C26CCA10B137CB9071162BF86CAA050C57BE0A4558` |
| `benchmarks/results/phase6/analysis-core.md` | `2803B3D1603D62F3376686748732F957F282B0A63F70FF4F6825B4E6F7FA5383` |
| `benchmarks/results/phase6/checkpoint.json` | `0A7E71BB937D8A9513BEB46A8CEF1528A5823FFED1932BCEFCC694F6B5C244F5` |
| `benchmarks/results/phase6/results.json` | `BFD1A7A3CBD7690EA0568966D80D7DB2B315E8447CADB5B4CECA4A981C20688B` |
| `benchmarks/results/phase7/checkpoint.json` | `5036E2073E60BCA06B9179383143A289307E0499A68DDC99268DE5CB22940ACC` |
| `benchmarks/results/phase7/order-log.json` | `B0FF74B23CBCF78F1A896FCDD56A5DEBA30E81EA2D10586F7B10E4D08DF68B90` |
| `benchmarks/results/phase7/results.json` | `370670F8264A572A815C15577B8649D49524994CCC0061C3EA7966F8D4A52F74` |
| `benchmarks/results/phase8/checkpoint.json` | `CBD4DFA0E61BCBE14243C3DD51CADA0ECB1666B9D3DB41618D84C5720E547FFB` |
| `benchmarks/results/phase8/results.json` | `DE10BB059C2425F2E502B617DF5B81B2E2072FD75667D35E0ADF1B6D1C5096FF` |

## 2. Verified unchanged (git)

`git status` confirms **no** frozen research file is modified or staged. The only
tracked-but-modified files are the two additive model-adapter changes declared below.

## 3. Phase 10 working-tree changes (declared)

### Tracked files modified (additive, default-preserving)

| File | Change | Impact on frozen behavior |
|---|---|---|
| `src/model/qwen3.ts` | `Qwen3Adapter` gains an optional `baseUrl` constructor param (default `http://localhost:11434`); error body truncated to 500 chars. | None when `baseUrl` omitted — identical endpoint/behavior. |
| `src/model/embedding.ts` | `MiniLMAdapter` gains an optional `baseUrl` constructor param (default `http://localhost:11434`). | None when `baseUrl` omitted — identical endpoint/behavior. |
| `package.json` | Added `main`/`module`/`types`/`exports`/`files`/`engines` entry fields for the runtime API; added a description. | Metadata only; no runtime behavior change. |

### New untracked files (Phase 10 deliverables)

- `src/config.ts` — runtime config defaults (frozen validated values) + validation
- `src/errors.ts` — structured `ScaffoldError` hierarchy
- `src/logger.ts` — security-aware logging abstraction
- `src/tools.ts` — generic tool registry + executor dispatch seam
- `src/runtime.ts` — runtime wiring (config, models, retrieval, tools, cancel/timeout, observability)
- `src/index.ts` — public API entry point
- `tests/{config,errors,tools,runtime}.test.ts` — Phase 10 tests (52 new)
- `examples/{basic,tools,assistant}.ts` — public-API usage examples

## 4. Scope guard

- **No** new cognitive/reasoning mechanism, planning, memory, reflection, or
  adaptive-retrieval feature was added (adaptive retrieval remains NOT SUPPORTED).
- **No** new model, benchmark, or benchmark result was added.
- **No** frozen system prompt, scaffold loop, executor, governor, feedback,
  state, or retriever semantics were changed.
- `tsconfig` strictness is unchanged; no `any`/`@ts-ignore` was introduced.
- Verification gate after Phase 10: `npm test` **227/227 passing**
  (175 frozen + 52 new); `npm run typecheck` clean; `npm run build` clean.
