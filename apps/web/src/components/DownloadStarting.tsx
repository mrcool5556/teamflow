/** Button content while a download is being handed to the browser. */
export function DownloadStarting() {
  return (
    <span className="download-starting">
      <span className="spinner" aria-hidden />
      Starting…
    </span>
  );
}
