import { shouldCleanupUploadedStorage } from "@/features/scans/components/newScanData";

// Guards the post-upload storage-cleanup decision: we must delete orphaned
// objects ONLY when the backend explicitly errored (no scan persisted), and
// must NOT delete on a transport/SSE drop — where the scan may already exist
// and reference those objects.

const PATHS = ["u-1/a.jpg", "u-1/b.jpg"];

describe("shouldCleanupUploadedStorage", () => {
  it("cleans up on an explicit backend error with no scan created", () => {
    expect(
      shouldCleanupUploadedStorage({ uploadedPaths: PATHS, scanCreated: false, backendErrored: true }),
    ).toBe(true);
  });

  it("does NOT clean up on a transport/SSE drop (no done, no error event)", () => {
    // The dangerous case the fix targets: backend may have created the scan.
    expect(
      shouldCleanupUploadedStorage({ uploadedPaths: PATHS, scanCreated: false, backendErrored: false }),
    ).toBe(false);
  });

  it("does NOT clean up when a scan was created (done event)", () => {
    expect(
      shouldCleanupUploadedStorage({ uploadedPaths: PATHS, scanCreated: true, backendErrored: false }),
    ).toBe(false);
  });

  it("does NOT clean up even if a late error arrives after a scan was created", () => {
    expect(
      shouldCleanupUploadedStorage({ uploadedPaths: PATHS, scanCreated: true, backendErrored: true }),
    ).toBe(false);
  });

  it("is a no-op when nothing was uploaded", () => {
    expect(shouldCleanupUploadedStorage({ uploadedPaths: null, scanCreated: false, backendErrored: true })).toBe(false);
    expect(shouldCleanupUploadedStorage({ uploadedPaths: [], scanCreated: false, backendErrored: true })).toBe(false);
  });
});
