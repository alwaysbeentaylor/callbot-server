const express = require('express');
const twilio = require('twilio');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

const ACCOUNT_SID = 'ACd1f165c129005466edfe3807f5bbf312';
const AUTH_TOKEN = '00a8e7f8f55212aa1efb06a7979910b7';
const TWILIO_NUMBER = '+12297158349';

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const BASE_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3000';

let campaigns = [];
let callLogs = [];
let agents = [
  { id: 1, name: 'Agent 1', number: null, status: 'offline' },
  { id: 2, name: 'Agent 2', number: null, status: 'offline' },
  { id: 3, name: 'Agent 3', number: null, status: 'offline' },
  { id: 4, name: 'Agent 4', number: null, status: 'offline' },
  { id: 5, name: 'Agent 5', number: null, status: 'offline' },
];

const ivrConfig = {
  welcomeMessage: 'Welkom bij onze klantenservice. Druk 1 voor verkoop, druk 2 voor support.',
  option1Number: '+31612345678',
  option2Number: '+31687654321',
  amdEnabled: true,
  recordingEnabled: true
};

app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    service: 'CallBot API',
    baseUrl: BASE_URL,
    twilioNumber: TWILIO_NUMBER
  });
});

app.post('/api/start-campaign', async (req, res) => {
  const { campaignName, contacts } = req.body;
  const campaign = {
    id: Date.now(),
    name: campaignName,
    contacts: contacts,
    status: 'running',
    results: []
  };
  campaigns.push(campaign);
  for (let contact of contacts) {
    setTimeout(() => makeCall(contact, campaign.id), Math.random() * 5000);
  }
  res.json({ success: true, campaignId: campaign.id });
});

async function makeCall(contact, campaignId) {
  try {
    const call = await client.calls.create({
      url: `${BASE_URL}/api/voice?contact=${encodeURIComponent(contact.number)}`,
      to: contact.number,
      from: TWILIO_NUMBER,
      machineDetection: ivrConfig.amdEnabled ? 'DetectMessageEnd' : 'Enable',
      asyncAmd: 'true',
      asyncAmdStatusCallback: `${BASE_URL}/api/amd-status`,
      record: ivrConfig.recordingEnabled,
      recordingStatusCallback: `${BASE_URL}/api/recording-status`,
      statusCallback: `${BASE_URL}/api/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });
    console.log(`Call initiated to ${contact.number}: ${call.sid}`);
    callLogs.push({
      callSid: call.sid,
      to: contact.number,
      from: TWILIO_NUMBER,
      status: 'initiated',
      timestamp: new Date(),
      campaignId: campaignId
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

app.post('/api/amd-status', (req, res) => {
  const { CallSid, AnsweredBy } = req.body;
  console.log(`AMD: ${CallSid} - ${AnsweredBy}`);
  const log = callLogs.find(l => l.callSid === CallSid);
  if (log) log.answeredBy = AnsweredBy;
  res.sendStatus(200);
});

app.post('/api/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const answeredBy = req.body.AnsweredBy;
  
  if (answeredBy === 'machine_end_beep' || answeredBy === 'machine_start') {
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }
  
  const gather = twiml.gather({
    numDigits: 1,
    action: `${BASE_URL}/api/gather`,
    method: 'POST',
    timeout: 10
  });
  
  gather.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, ivrConfig.welcomeMessage);
  twiml.redirect(`${BASE_URL}/api/voice`);
  res.type('text/xml').send(twiml.toString());
});

app.post('/api/gather', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const digit = req.body.Digits;
  
  if (digit === '1') {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ik verbind u door met verkoop.');
    twiml.dial({ callerId: TWILIO_NUMBER }, ivrConfig.option1Number);
  } else if (digit === '2') {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ik verbind u door met support.');
    twiml.dial({ callerId: TWILIO_NUMBER }, ivrConfig.option2Number);
  } else {
    twiml.say({ voice: 'Polly.Ruben', language: 'nl-NL' }, 
      'Ongeldige keuze.');
    twiml.redirect(`${BASE_URL}/api/voice`);
  }
  res.type('text/xml').send(twiml.toString());
});

app.post('/api/call-status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid}: ${CallStatus}`);
  const log = callLogs.find(l => l.callSid === CallSid);
  if (log) {
    log.status = CallStatus;
    log.duration = CallDuration;
  }
  res.sendStatus(200);
});

app.post('/api/recording-status', (req, res) => {
  const { CallSid, RecordingUrl, RecordingSid } = req.body;
  const log = callLogs.find(l => l.callSid === CallSid);
  if (log) log.recordingUrl = RecordingUrl;
  res.sendStatus(200);
});

app.get('/api/agents', (req, res) => {
  res.json(agents);
});

app.get('/api/campaigns', (req, res) => {
  res.json(campaigns);
});

app.get('/api/call-logs', (req, res) => {
  res.json(callLogs);
});

app.post('/api/test-call', async (req, res) => {
  const { toNumber } = req.body;
  try {
    const call = await client.calls.create({
      url: `${BASE_URL}/api/voice`,
      to: toNumber,
      from: TWILIO_NUMBER,
      record: true
    });
    res.json({ success: true, callSid: call.sid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT