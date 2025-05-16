const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const readline = require('readline');
const mime = require('mime');

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json'; // Download from Google Cloud Console

function authorize(callback) {
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
    oAuth2Client.setCredentials(token);
    callback(oAuth2Client);
  } else {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });
    console.log('\n👉 Open this URL to authorize:\n', authUrl);

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\n🔑 Enter the code from browser: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('❌ Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
        console.log('✅ Token saved to', TOKEN_PATH);
        callback(oAuth2Client);
      });
    });
  }
}

function uploadToDrive(filePath, callback) {
  authorize((auth) => {
    const drive = google.drive({ version: 'v3', auth });
    const fileName = path.basename(filePath);

    drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: mime.getType(filePath),
      },
      media: {
        mimeType: mime.getType(filePath),
        body: fs.createReadStream(filePath),
      },
      fields: 'id',
    }, (err, res) => {
      if (err) return console.error('❌ Upload error:', err);

      const fileId = res.data.id;
      drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
      }, (err2) => {
        if (err2) return console.error('❌ Permission error:', err2);
        const publicUrl = `https://drive.google.com/file/d/${fileId}/view?usp=drivesdk`;
        console.log('✅ File uploaded to Drive!');
        console.log('🔗 Public link:', publicUrl);
        callback(publicUrl);
      });
    });
  });
}

module.exports = { uploadToDrive };

