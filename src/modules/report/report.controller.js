import mongoose from "mongoose";
import { getContainer } from "../../container/index.js";

class ReportController {
  async createReport(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          status: "error",
          message: "Authentication required",
        });
      }

      const container = getContainer();
      const reportService = container.resolve("reportService");

      const {
        reason_code,
        description = "",
        target_type = "post",
        target_ref: rawTargetRef,
        evidence_files = [],
      } = req.body;

      if (!reason_code?.trim() || !rawTargetRef) {
        return res.status(400).json({
          status: "error",
          message: "reason_code and target_ref are required",
        });
      }

      let target_ref;
      try {
        target_ref = new mongoose.Types.ObjectId(rawTargetRef);
      } catch {
        return res.status(400).json({
          status: "error",
          message: "Invalid target_ref format",
        });
      }

      const reportData = {
        report_ref: `REP-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
        reporter_ref: req.user.userId,
        target_type,
        target_ref,
        reason_code: reason_code.trim(),
        description: description.trim(),
        evidence_files: Array.isArray(evidence_files) ? evidence_files : [],
        status: "pending",
      };

      const report = await reportService.createReport(reportData);

      res.status(201).json({
        status: "success",
        message: "Report submitted successfully",
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
}

export default new ReportController();
