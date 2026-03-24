import Response from '../../core/Response.js';

export default class HelpRequestController {
  constructor({ helprequestService }) {
    this.helpRequestService = helprequestService;
  }

  createHelpRequest = async (req, res, next) => {
    try {
      const helpRequest = await this.helpRequestService.createHelpRequest(
        req.user.userId,
        req.body
      );
      return Response.created(res, helpRequest, 'Help request created successfully');
    } catch (error) {
      next(error);
    }
  };

  getHelpRequests = async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        category,
        urgencyLevel,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (category) filters.category = category;
      if (urgencyLevel) filters.urgencyLevel = urgencyLevel;
      if (search) filters.search = search;

      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      };

      const result = await this.helpRequestService.getHelpRequests(filters, options);
      return Response.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  getMyHelpRequests = async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = req.query;

      const filters = {};
      if (status) filters.status = status;

      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
      };

      const result = await this.helpRequestService.getMyHelpRequests(
        req.user.userId,
        filters,
        options
      );
      return Response.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  getHelpRequestById = async (req, res, next) => {
    try {
      const helpRequest = await this.helpRequestService.getHelpRequestById(
        req.params.id,
        req.user?.userId
      );
      return Response.success(res, helpRequest);
    } catch (error) {
      next(error);
    }
  };

  updateHelpRequest = async (req, res, next) => {
    try {
      const helpRequest = await this.helpRequestService.updateHelpRequest(
        req.params.id,
        req.user.userId,
        req.body
      );
      return Response.success(res, helpRequest, 'Help request updated successfully');
    } catch (error) {
      next(error);
    }
  };

  deleteHelpRequest = async (req, res, next) => {
    try {
      await this.helpRequestService.deleteHelpRequest(req.params.id, req.user.userId);
      return Response.noContent(res);
    } catch (error) {
      next(error);
    }
  };

  cancelHelpRequest = async (req, res, next) => {
    try {
      const helpRequest = await this.helpRequestService.cancelHelpRequest(
        req.params.id,
        req.user.userId
      );
      return Response.success(res, helpRequest, 'Help request cancelled successfully');
    } catch (error) {
      next(error);
    }
  };

  verifyHelpRequest = async (req, res, next) => {
    try {
      const { approved, rejectionReason } = req.body;
      const helpRequest = await this.helpRequestService.verifyHelpRequest(
        req.params.id,
        req.user.userId,
        approved,
        rejectionReason
      );
      return Response.success(
        res,
        helpRequest,
        approved ? 'Help request verified successfully' : 'Help request rejected'
      );
    } catch (error) {
      next(error);
    }
  };

  assignOrganizer = async (req, res, next) => {
    try {
      const { organizerId } = req.body;
      const helpRequest = await this.helpRequestService.assignOrganizer(
        req.params.id,
        req.user.userId,
        organizerId
      );
      return Response.success(res, helpRequest, 'Organizer assigned successfully');
    } catch (error) {
      next(error);
    }
  };

  completeHelpRequest = async (req, res, next) => {
    try {
      const helpRequest = await this.helpRequestService.completeHelpRequest(
        req.params.id,
        req.user.userId
      );
      return Response.success(res, helpRequest, 'Help request completed successfully');
    } catch (error) {
      next(error);
    }
  };

  getUrgentRequests = async (req, res, next) => {
    try {
      const { page = 1, limit = 10 } = req.query;
      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      };
      const result = await this.helpRequestService.getUrgentRequests(options);
      return Response.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  getNearbyRequests = async (req, res, next) => {
    try {
      const { lng, lat, maxDistance = 50000, page = 1, limit = 10 } = req.query;

      if (!lng || !lat) {
        return Response.error(res, 'Coordinates are required', 400);
      }

      const coordinates = [parseFloat(lng), parseFloat(lat)];
      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
      };

      const result = await this.helpRequestService.getNearbyRequests(
        coordinates,
        parseInt(maxDistance, 10),
        options
      );
      return Response.success(res, result);
    } catch (error) {
      next(error);
    }
  };

  getStats = async (req, res, next) => {
    try {
      const stats = await this.helpRequestService.getStats();
      return Response.success(res, stats);
    } catch (error) {
      next(error);
    }
  };
}
