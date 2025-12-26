// npm install qrcode
//
// If you have "esModuleInterop": true in tsconfig:
//   import QRCode from "qrcode";
// Otherwise this import works in most setups:
import * as QRCode from "qrcode";
import { exec } from 'child_process';
import path from 'path';
import P from "pino";

const outputPath = path.join(import.meta.dirname, "..",  '/qr_whatsapp_mcp.png'); // Replace with your file path
/**
 * Render a QR code in the terminal using Braille characters.
 * - Automatically uses the smallest possible QR version.
 * - Error correction = 'L' (smallest).
 */

export async function generateQR(text: string, logger: P.Logger) {
  try {
    // Option A: directly to file using QRCode.toFile
    await QRCode.toFile(outputPath, text, {
      type: "png",        // default is png; can omit
      margin: 2,          // white border
      width: 256,         // size in pixels
      errorCorrectionLevel: "H",
    });
  }catch (err) {
    console.error("Failed to generate QR PNG:", err);
  }

let command;

// Determine the correct command based on the operating system
switch (process.platform) {
  case 'darwin': // macOS
    command = 'open';
    break;
  case 'win32': // Windows
    command = 'start ""'; // Use an empty string argument to handle paths with spaces
    break;
  case 'linux': // Linux
    command = 'xdg-open';
    break;
  default:
    logger.error('Unsupported operating system for qr display: ' + process.platform);
}

// Execute the command to open the image file
exec(`${command} "${outputPath}"`, (err) => {
  if (err) {
    logger.error(err,'Error opening qr image');
  } else {
    logger.info(`Successfully opened qr image: ${outputPath}`);
  }
});
}
