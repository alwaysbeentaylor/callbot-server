const express = require('express');
const twilio = require('twilio');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Twilio Config
const ACCOUNT_SID = 'ACd1f165c129005466edfe3807f5bbf312';
const AUTH_TOKEN = '00a8e7f8f55212aa1efb06a7979910b7';
const TWILIO_NUMBER = '+12297158349';
const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

// Base URL voor Render
const BASE_URL = process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';

// Storage
let callLogs = [];
let campaigns = [];

// IVR Config (VERVANG MET JE EIGEN NUMMERS!)
const ivrConfig = {
  welcomeMessage: 'Welkom bij onze klantenservice. Druk 1 voor verkoop, druk 2 voor support.',
  option1Number: '+31612345678',  // ← VERVANG DIT
  option2Number: '+31687654321',  // ← VERVANG DIT
  amdEnabled: true,
  recordingEnabled: true
};

// Health Check
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    service: 'CallBot API',
    baseUrl: BASE_URL,
    twilioNumber: TWILIO_NUMBER
  });
});

// Test Call
app.post('/api/test-call', async (req, res) => {
  const { toNumber } = req.body;
  try {
    const call = await client.calls.create({
      url: `${BASE_URL}/api/voice`,
      to: toNumber,
      from: TWILIO_NUMBER,
      machineDetection: 'Enable',
      statusCallback: `${BASE_URL}/api/call-status`
    });
    console.log(`Test call started: ${call.sid}`);
    res.json({ success: true, callSid: call.sid, message: 'Call initiated!' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Voice Webhook - IVR Menu
app.post('/api/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const answeredBy = req.body.AnsweredBy;
  
  console.log('Voice webhook called, AnsweredBy:', answeredBy);
  
  // Skip voicemail
  if (answeredBy === 'machine_end_beep' || answeredBy === 'machine_start') {
    console.log('Voicemail detected - hanging up');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }
  
  // Play IVR menu
  const gather = twiml.gather({
    numDigits: 1,
    action: `${BASE_URL}/api/gather`,
    method: 'POST',
    timeout: 10
  });
  
  gather.say({ 
    voice: 'Polly.Ruben', 
    language: 'nl-NL' 
  }, ivrConfig.welcomeMessage);
  
  // If no input, repeat
  twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
    'We hebben geen keuze ontvangen. Tot ziens.');
  twiml.hangup();
  
  res.type('text/xml').send(twiml.toString());
});

// Gather - Route call based on input
app.post('/api/gather', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digit = req.body.Digits;
  const callSid = req.body.CallSid;
  
  console.log(`Call ${callSid} - User pressed: ${digit}`);
  
  if (digit === '1') {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ik verbind u door met verkoop. Een moment alstublieft.');
    twiml.dial({
      callerId: TWILIO_NUMBER,
      record: ivrConfig.recordingEnabled ? 'record-from-answer' : 'do-not-record'
    }, ivrConfig.option1Number);
  } else if (digit === '2') {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ik verbind u door met support. Een moment alstublieft.');
    twiml.dial({
      callerId: TWILIO_NUMBER,
      record: ivrConfig.recordingEnabled ? 'record-from-answer' : 'do-not-record'
    }, ivrConfig.option2Number);
  } else {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ongeldige keuze. Probeer het opnieuw.');
    twiml.redirect(`${BASE_URL}/api/voice`);
  }
  
  res.type('text/xml').send(twiml.toString());
});

// Call Status Updates
app.post('/api/call-status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid} status: ${CallStatus}, duration: ${CallDuration}s`);
  
  callLogs.push({
    callSid: CallSid,
    status: CallStatus,
    duration: CallDuration,
    timestamp: new Date()
  });
  
  res.sendStatus(200);
});

// Get Call Logs
app.get('/api/call-logs', (req, res) => {
  res.json(callLogs);
});

// Get Config
app.get('/api/config', (req, res) => {
  res.json({
    baseUrl: BASE_URL,
    twilioNumber: TWILIO_NUMBER,
    amdEnabled: ivrConfig.amdEnabled,
    recordingEnabled: ivrConfig.recordingEnabled
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 CallBot server running on port ${PORT}`);
  console.log(`📞 Twilio number: ${TWILIO_NUMBER}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log(`⚙️  AMD enabled: ${ivrConfig.amdEnabled}`);
  console.log(`🎙️  Recording enabled: ${ivrConfig.recordingEnabled}`);
});
