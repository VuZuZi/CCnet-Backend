import mongoose from "mongoose";

class ReportController {
  constructor({ reportService }) {
    this.reportService = reportService;
  }

  createReport = async (req, res, next) => {
    try {
      if (!req.user) {
        return res
          .status(401)
          .json({ status: "error", message: "Authentication required" });
      }

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
      } catch (err) {
        return res
          .status(400)
          .json({ status: "error", message: "Invalid target_ref format" });
      }

      const reportData = {
        report_ref: `REP-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 10)}`,
        reporter_ref: req.user._id,
        target_type,
        target_ref,
        reason_code: reason_code.trim(),
        description: description.trim(),
        evidence_files: Array.isArray(evidence_files) ? evidence_files : [],
        status: "pending",
      };

      const report = await this.reportService.createReport(reportData);

      res.status(201).json({
        status: "success",
        message: "Report submitted successfully",
        data: report,
      });
    } catch (error) {
      next(error);
    }
  };

  getReports = async (req, res, next) => {
    try {
      const reports = await this.reportService.getReports(req.query);

      res.json({ status: "success", data: reports });
    } catch (error) {
      next(error);
    }
  };

  reviewReport = async (req, res, next) => {
    try {
      const { reportId } = req.params;

      const update = req.body;

      const updated = await this.reportService.reviewReport(
        reportId,

        req.user._id,

        update
      );

      res.json({ status: "success", data: updated });
    } catch (error) {
      next(error);
    }
  };
}

export default ReportController;
