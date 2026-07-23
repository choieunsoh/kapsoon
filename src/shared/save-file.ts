// Hand a generated file to the user. Prefers the OS share sheet (Web Share API level 2), which is
// what puts Google Drive / Gmail / Telegram in reach on a phone without this app owning any OAuth —
// the platform brokers the handoff, so a static export with no server can still "send to Drive".
// Falls back to a plain download where files can't be shared (most desktop browsers).
//
// Ported from moniflow's shared/save-file.ts, comments and all — the caveats below were paid for
// once already and are not obvious from the spec.
//
// navigator.share needs transient user activation, so callers must reach here within ~5s of the tap
// and must not await anything first. (Coffee's backup text is serialized from in-memory state rather
// than read from OPFS, so its handler is synchronous up to this call.)
//
// canShare is NOT the whole test: desktop Chrome answers true and then opens the Windows share
// flyout, which has no Drive in it and is strictly worse than the download it replaced. Capability
// isn't usefulness — the sheet is only worth preferring where it's the native way to move a file,
// i.e. a phone. ponytail: pointer:coarse stands in for "phone"; a touch laptop would get the sheet
// too (its primary pointer is still fine, so in practice it doesn't). Revisit if desktop share
// sheets ever grow real cloud targets.
export async function saveFile(name: string, type: string, text: string): Promise<void> {
  const file = new File([text], name, { type });
  const isPhone = window.matchMedia('(pointer: coarse)').matches;

  if (isPhone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      // Dismissing the share sheet is a decision, not a failure — don't consolation-download a file
      // the user just declined to send. Any other rejection (no target, lapsed activation) falls through.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
