/**
 * Coordinates video-context resets with output startup. Active outputs are
 * checked by the caller; this closes the smaller race where an output begins
 * while a reset transaction is being prepared (or vice versa).
 */
class VideoOutputCoordinator {
  private outputStartsInProgress = 0;
  private videoResetReservations = 0;

  beginOutputStart(): () => void {
    if (this.videoResetReservations > 0) {
      throw new Error('A video canvas change is currently in progress.');
    }

    this.outputStartsInProgress++;
    return this.createRelease(() => this.outputStartsInProgress--);
  }

  reserveVideoReset(): () => void {
    if (this.outputStartsInProgress > 0) {
      throw new Error('A video output is currently starting.');
    }
    if (this.videoResetReservations > 0) {
      throw new Error('Another video canvas operation is already in progress.');
    }

    this.videoResetReservations++;
    return this.createRelease(() => this.videoResetReservations--);
  }

  private createRelease(release: () => void): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      release();
    };
  }
}

export const videoOutputCoordinator = new VideoOutputCoordinator();
