/**
 * Middleware to validate incoming incident report bodies.
 */
export const validateIncidentReport = (req, res, next) => {
  const { category, latitude, longitude } = req.body;

  if (!category) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required field: category" 
    });
  }

  if (latitude === undefined || longitude === undefined) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required fields: latitude and longitude are both required" 
    });
  }

  const latNum = Number(latitude);
  const lngNum = Number(longitude);

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid latitude. Must be a number between -90 and 90." 
    });
  }

  if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
    return res.status(400).json({ 
      success: false, 
      error: "Invalid longitude. Must be a number between -180 and 180." 
    });
  }

  next();
};

/**
 * Middleware to validate incoming status update requests.
 */
export const validateStatusUpdate = (req, res, next) => {
  const { status } = req.body;
  const validStatuses = ['Pending', 'Verified', 'Dispatched', 'Resolved'];

  if (!status) {
    return res.status(400).json({ 
      success: false, 
      error: "Missing required field: status" 
    });
  }

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      success: false, 
      error: `Invalid status value. Must be one of: ${validStatuses.join(', ')}` 
    });
  }

  next();
};
