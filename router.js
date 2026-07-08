import { Router } from 'express';
import crypto from 'crypto';
import { 
  IncidentModel, 
  isDbConnected, 
  mockIncidents, 
  updateMockIncidents 
} from './db.js';
import { 
  validateIncidentReport, 
  validateStatusUpdate 
} from './middleware/validation.js';

const router = Router();

// Haversine distance formula to compute distance in meters between two coordinates
function getHaversineDistance(lon1, lat1, lon2, lat2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // distance in meters
}

/**
 * GET /api/v1/incidents
 * Retrieves all reported emergency incidents (either via MongoDB or mock fallback)
 */
router.get('/incidents', async (req, res, next) => {
  try {
    if (isDbConnected()) {
      const incidents = await IncidentModel.find().sort({ createdAt: -1 });
      
      // Calculate nearby alerts count dynamically for each DB incident
      const parsedIncidents = await Promise.all(incidents.map(async (inc) => {
        const coords = inc.location.coordinates; // [lng, lat]
        // Use $geoWithin with $centerSphere since $near is restricted in this context.
        const earthRadiusMeters = 6371000;
        const radiusRadians = 2000 / earthRadiusMeters; // 2km in radians

        const count = await IncidentModel.countDocuments({
          location: {
            $geoWithin: {
              $centerSphere: [[coords[0], coords[1]], radiusRadians]
            }
          },
          createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
        });

        return {
          _id: inc._id.toString(),
          senderToken: inc.senderToken,
          category: inc.category,
          location: inc.location,
          audioRef: inc.audioRef,
          status: inc.status,
          threatPriority: count >= 3 ? 'High' : inc.threatPriority,
          createdAt: inc.createdAt.toISOString(),
          nearbyAlertCount: count
        };
      }));

      return res.json({ success: true, incidents: parsedIncidents });
    } else {
      // Return mock in-memory store
      return res.json({ success: true, incidents: mockIncidents });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/incidents/report
 * Endpoint to securely report critical incidents.
 * Anonymizes ID, extracts coords, and checks co-located alerts to upgrade priority.
 */
router.post('/incidents/report', validateIncidentReport, async (req, res, next) => {
  try {
    const { 
      category, 
      latitude, 
      longitude, 
      audioPayload, 
      description, 
      locationDetails, 
      reporterName, 
      isFormReport 
    } = req.body;

    // 1. Privacy & Stealth: Strip metadata and generate Military-Grade SHA256 anonymous sender ID.
    const rawIp = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const timestamp = Date.now().toString();
    const hashSource = `${rawIp}-${timestamp}-${Math.random()}`;
    const anonymousToken = 'sha256-' + crypto.createHash('sha256').update(hashSource).digest('hex').substring(0, 32);

    // 2. Geospatial Cluster analysis:
    // Check if 3 or more alerts have arrived within a 2km radius to dynamically upgrade threat level.
    let isCritical = false;
    let nearbyCount = 1;

    if (isDbConnected()) {
      // Query Mongo 2dsphere index for documents within 2km of coordinates
      // Use $geoWithin + $centerSphere to find documents within radius (2km)
      const earthRadiusMeters = 6371000;
      const radiusRadians = 2000 / earthRadiusMeters; // 2km in radians

      const nearbyAlerts = await IncidentModel.find({
        location: {
          $geoWithin: {
            $centerSphere: [[longitude, latitude], radiusRadians]
          }
        },
        createdAt: {
          $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) // Within past 2 hours
        }
      });

      nearbyCount = nearbyAlerts.length + 1; // including current alert
      if (nearbyCount >= 3) {
        isCritical = true;
      }

      // Save to MongoDB
      const newIncident = new IncidentModel({
        senderToken: anonymousToken,
        category,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude] // [long, lat]
        },
        audioRef: audioPayload,
        description,
        locationDetails,
        reporterName: reporterName || 'Anonymous',
        isFormReport: !!isFormReport,
        status: 'Pending',
        threatPriority: isCritical ? 'High' : 'Normal',
        createdAt: new Date()
      });

      await newIncident.save();

      // If threat levels changed, upgrade nearby alerts as well
      if (isCritical) {
        await IncidentModel.updateMany(
          {
            _id: { $in: nearbyAlerts.map(a => a._id) }
          },
          {
            $set: { threatPriority: 'High' }
          }
        );
      }

      const returnedIncident = {
        _id: newIncident._id.toString(),
        senderToken: anonymousToken,
        category,
        location: newIncident.location,
        audioRef: newIncident.audioRef,
        description: newIncident.description,
        locationDetails: newIncident.locationDetails,
        reporterName: newIncident.reporterName,
        isFormReport: newIncident.isFormReport,
        status: newIncident.status,
        threatPriority: isCritical ? 'High' : 'Normal',
        createdAt: newIncident.createdAt.toISOString(),
        nearbyAlertCount: nearbyCount
      };

      return res.status(201).json({ success: true, incident: returnedIncident });

    } else {
      // In-memory calculations using mathematically accurate Haversine Distance
      const currentTime = new Date();
      const recentlyActiveMockIncidents = mockIncidents.filter(inc => {
        const timeDiffMs = currentTime.getTime() - new Date(inc.createdAt).getTime();
        return timeDiffMs <= 2 * 60 * 60 * 1000; // Within past 2 hours
      });

      const matchingColocated = recentlyActiveMockIncidents.filter(inc => {
        const dist = getHaversineDistance(
          longitude, 
          latitude, 
          inc.location.coordinates[0], 
          inc.location.coordinates[1]
        );
        return dist <= 2000; // 2km
      });

      nearbyCount = matchingColocated.length + 1;
      if (nearbyCount >= 3) {
        isCritical = true;
      }

      // Assemble new in-memory mock document
      const newIncidentMock = {
        _id: `mock-inc-${Date.now()}`,
        senderToken: anonymousToken,
        category,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        audioRef: audioPayload,
        description,
        locationDetails,
        reporterName: reporterName || 'Anonymous',
        isFormReport: !!isFormReport,
        status: 'Pending',
        threatPriority: isCritical ? 'High' : 'Normal',
        createdAt: currentTime.toISOString(),
        nearbyAlertCount: nearbyCount
      };

      // Update mock database store
      let updatedMocks = [newIncidentMock, ...mockIncidents];

      // If threat levels changed, upgrade nearby in-memory alerts
      if (isCritical) {
        updatedMocks = updatedMocks.map(inc => {
          const dist = getHaversineDistance(
            longitude,
            latitude,
            inc.location.coordinates[0],
            inc.location.coordinates[1]
          );
          if (dist <= 2000) {
            return { ...inc, threatPriority: 'High', nearbyAlertCount: nearbyCount };
          }
          return inc;
        });
      }

      updateMockIncidents(updatedMocks);

      return res.status(201).json({ success: true, incident: newIncidentMock });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/v1/incidents/:id/status
 * Updates status of reports (Verify, Dispatch, Resolve)
 */
router.patch('/incidents/:id/status', validateStatusUpdate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (isDbConnected()) {
      const updated = await IncidentModel.findByIdAndUpdate(
        id,
        { $set: { status } },
        { new: true }
      );
      
      if (!updated) {
        return res.status(404).json({ success: false, error: "Incident report not found" });
      }

      return res.json({ success: true, incident: updated });
    } else {
      let found = false;
      const updatedMocks = mockIncidents.map(inc => {
        if (inc._id === id) {
          found = true;
          return { ...inc, status: status };
        }
        return inc;
      });

      if (!found) {
        return res.status(404).json({ success: false, error: "Incident report not found in session memory" });
      }

      updateMockIncidents(updatedMocks);
      return res.json({ success: true });
    }
  } catch (error) {
    next(error);
  }
});

export default router;
