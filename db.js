import mongoose, { Schema } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

// Initialize connection
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB Atlas!');
    })
    .catch((err) => {
      console.error('Error connecting to MongoDB Atlas, enabling resilient mock database fallback.', err);
    });
} else {
  console.log('No MONGODB_URI supplied. Running in resilient mock local-database mode.');
}

export const isDbConnected = () => {
  return mongoose.connection.readyState === 1;
};

// --- MONGODB SCHEMA ---
const IncidentSchema = new Schema({
  senderToken: { type: String, required: true },
  category: { type: String, required: true },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  audioRef: { type: String },
  description: { type: String },
  locationDetails: { type: String },
  reporterName: { type: String, default: 'Anonymous' },
  isFormReport: { type: Boolean, default: false },
  status: { 
    type: String, 
    enum: ['Pending', 'Verified', 'Dispatched', 'Resolved'], 
    default: 'Pending',
    required: true 
  },
  threatPriority: { 
    type: String, 
    enum: ['High', 'Normal'], 
    default: 'Normal',
    required: true 
  },
  createdAt: { type: Date, default: Date.now }
});

// Ensure index exists for Geospatial Queries
IncidentSchema.index({ location: '2dsphere' });

let IncidentModel;
try {
  IncidentModel = mongoose.model('Incident', IncidentSchema);
} catch {
  IncidentModel = mongoose.model('Incident');
}

export { IncidentModel };

// --- RESILIENT IN-MEMORY MOCK DATABASE ---
// Pure Node JS generator to output a valid 16-bit PCM WAV base64 tactical radio distress signal
export const generateSyntheticWavBase64 = () => {
  const sampleRate = 8000;
  const duration = 2.5; // 2.5 seconds
  const numSamples = sampleRate * duration;
  const buffer = Buffer.alloc(44 + numSamples * 2);

  // Write RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(1, 22); // Mono channel
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); // Block Align
  buffer.writeUInt16LE(16, 34); // Bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sampleVal = 0;

    if (t < 0.15) {
      // First military radio beep (smooth envelope to prevent clicking)
      const envelope = Math.sin(Math.PI * (t / 0.15));
      sampleVal = Math.sin(2 * Math.PI * 550 * t) * envelope * 0.35;
    } else if (t >= 0.15 && t < 0.22) {
      // Short tactical gap
      sampleVal = 0;
    } else if (t >= 0.22 && t < 0.37) {
      // Second military radio beep
      const envelope = Math.sin(Math.PI * ((t - 0.22) / 0.15));
      sampleVal = Math.sin(2 * Math.PI * 550 * (t - 0.22)) * envelope * 0.35;
    } else {
      // Quiet background radio static/hiss (walkie-talkie open channel simulation)
      let fade = 1.0;
      if (duration - t < 0.3) {
        fade = (duration - t) / 0.3;
      }
      const hum = Math.sin(2 * Math.PI * 60 * t) * 0.008; // 60Hz hum
      const whiteNoise = (Math.random() * 2 - 1) * 0.03; // gentle walkie-talkie static
      sampleVal = (hum + whiteNoise) * fade;
    }

    const val = Math.max(-32768, Math.min(32767, sampleVal * 32767));
    buffer.writeInt16LE(val, offset);
    offset += 2;
  }

  return `data:audio/wav;base64,${buffer.toString('base64')}`;
};

// Realistic Zamfara incident logs for dispatcher command view fallback
export let mockIncidents = [
  {
    _id: "mock-inc-1",
    senderToken: "sha256-8f2e8b91cc09852f10b809fa8fe3e",
    category: "Banditry / Attack",
    location: {
      type: "Point",
      coordinates: [6.6614, 12.1628] // Gusau center coordinates
    },
    audioRef: generateSyntheticWavBase64(),
    status: "Pending",
    threatPriority: "Normal",
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    nearbyAlertCount: 1
  },
  {
    _id: "mock-inc-2",
    senderToken: "sha256-4c9b9101f35bc07ad9871fc3e120d",
    category: "Kidnapping",
    location: {
      type: "Point",
      coordinates: [6.6710, 12.1580] // Within 2km of Gusau center
    },
    audioRef: generateSyntheticWavBase64(),
    status: "Verified",
    threatPriority: "Normal",
    createdAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
    nearbyAlertCount: 2
  }
];

// Helper to update mock list
export const updateMockIncidents = (newList) => {
  mockIncidents = newList;
};
