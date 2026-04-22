import mongoose from "mongoose";

const COMPLETED_PROJECT_STATUSES = new Set([
  "COMPLETED",
  "COMPLETED_SUCCESSFULLY",
  "COMPLETED_PARTIAL",
]);

class ProjectStatusChangeStreamService {
  constructor({ volunteerEngagementService }) {
    this.volunteerEngagementService = volunteerEngagementService;
    this.changeStream = null;
    this.restartTimeout = null;
    this.isStarting = false;
  }

  _isReplicaSetError(error) {
    const message = String(error?.message || "").toLowerCase();
    return (
      message.includes("replica set") ||
      message.includes("not supported") ||
      message.includes("change stream") ||
      message.includes("$changestream")
    );
  }

  async _handleChange(change) {
    try {
      if (!change) return;

      const operationType = change.operationType;

      if (!["update", "replace"].includes(operationType)) {
        return;
      }

      const fullDocument = change.fullDocument;
      const projectId = change.documentKey?._id;

      if (!projectId || !fullDocument) {
        return;
      }

      const normalizedStatus = String(fullDocument.status || "").toUpperCase();

      if (!COMPLETED_PROJECT_STATUSES.has(normalizedStatus)) {
        return;
      }

      await this.volunteerEngagementService.onProjectCompleted(projectId);

      console.log(
        `[ProjectStatusChangeStream] completed project detected and initialized: ${String(projectId)}`
      );
    } catch (error) {
      console.error(
        "[ProjectStatusChangeStream] handle change failed:",
        error?.message || error
      );
    }
  }

  _scheduleRestart() {
    if (this.restartTimeout) {
      return;
    }

    this.restartTimeout = setTimeout(async () => {
      this.restartTimeout = null;
      await this.start();
    }, 5000);
  }

  async start() {
    if (this.changeStream || this.isStarting) {
      return;
    }

    this.isStarting = true;

    try {
      const db = mongoose.connection;

      if (!db || db.readyState !== 1) {
        console.warn(
          "[ProjectStatusChangeStream] MongoDB chưa sẵn sàng, bỏ qua start."
        );
        return;
      }

      const collection = db.collection("projects");

      this.changeStream = collection.watch(
        [
          {
            $match: {
              operationType: { $in: ["update", "replace"] },
            },
          },
        ],
        {
          fullDocument: "updateLookup",
        }
      );

      this.changeStream.on("change", async (change) => {
        await this._handleChange(change);
      });

      this.changeStream.on("error", async (error) => {
        console.error(
          "[ProjectStatusChangeStream] stream error:",
          error?.message || error
        );

        await this.stop();

        if (!this._isReplicaSetError(error)) {
          this._scheduleRestart();
        }
      });

      this.changeStream.on("end", async () => {
        await this.stop();
        this._scheduleRestart();
      });

      console.log("[ProjectStatusChangeStream] started");
    } catch (error) {
      if (this._isReplicaSetError(error)) {
        console.warn(
          "[ProjectStatusChangeStream] MongoDB hiện không hỗ trợ change stream. Hãy dùng replica set hoặc giữ reconciler làm fallback."
        );
      } else {
        console.error(
          "[ProjectStatusChangeStream] start failed:",
          error?.message || error
        );
        this._scheduleRestart();
      }
    } finally {
      this.isStarting = false;
    }
  }

  async stop() {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.changeStream) {
      try {
        await this.changeStream.close();
      } catch (_) {}
      this.changeStream = null;
    }
  }
}

export default ProjectStatusChangeStreamService;