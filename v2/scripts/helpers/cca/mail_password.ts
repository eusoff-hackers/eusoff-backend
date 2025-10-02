/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import { parse } from "csv-parse";
import * as fs from "fs";
import nodemailer from "nodemailer";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

interface Data {
  username: string;
  email: string;
  // id: string;
  password: string;
}

const transport = nodemailer.createTransport({
  host: "smtp.sendgrid.net",
  port: 465,
  secure: true,
  // service: "Outlook365",
  auth: {
    user: "apikey",
    pass: process.env.SENDGRID_API,
  },
});

async function mail(user: Data) {
  try {
    const { username, password, email } = user;
    const template = `<!DOCTYPE html>
    <html lang="en">
    
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Account Details</title>
    </head>
    
    <body style="font-family: 'Roboto', Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7; color: #333;">
    
        <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f7f7f7">
            <tr>
                <td align="center" valign="top" style="padding: 5% 10px;">
                    <table width="600" border="0" cellspacing="0" cellpadding="20" bgcolor="#ffffff" style="border-radius: 8px; box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.1);">
                        <tr>
                            <td>
                                <h2 style="margin-bottom: 30px; color: #333;">Welcome to Eusoff!</h2>
                                <p style="margin-bottom: 20px; color: #666; line-height: 1.6;">Eusoff Hackers welcomes you to a new AY in Eusoff! We will be in charge of collecting your details for CCA Signup. Here are your account details for CCA Signup:</p>
                                <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 30px;">
                                    <p style="margin: 0; color: #666; line-height: 1.6;"><strong>Username:</strong> ${username}</p>
                                    <p style="margin: 0; color: #666; line-height: 1.6;"><strong>Password:</strong> ${password}</p>
                                </div>
                                <p style="margin-bottom: 30px; color: #666; line-height: 1.6;">
                                    <a href="https://eusoff.org/" style="background-color: #333; color: #f7f7f7; padding: 10px 15px; border-radius: 5px; text-decoration: none;">Visit the Website</a>
                                </p>
                                <p style="margin-bottom: 20px; color: #666; line-height: 1.6;">You will be able to log in to the site and indicate your preferences now! For further questions, you can directly ask <a href="https://t.me/juancarlovieri">@juancarlovieri</a> on Telegram</p>
                                <p style="margin-bottom: 30px; color: #aaa; line-height: 1.6;">If you are not the intended recipient of this email, please reply to this email immediately.</p>
                                <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
                                <p style="margin-bottom: 0; color: #aaa; line-height: 1.6;">To an awesome year in Eusoff,<br>Eusoff Hackers</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    
    </body>
    
    </html>`;

    console.log(`Sending email to: ${username}`);
    await transport.sendMail({
      from: process.env.EMAIL, // sender address
      to: email, // list of receivers
      subject: "Credentials for CCA Signup", // Subject line
      // text: mail.password, // plain text body
      html: template, // html body
    });
    console.log(`Email to ${username} sent.`);
  } catch (error) {
    console.error(`Mailing error `, error);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

(async () => {
  const csvFilePath = "./v2/scripts/csv/passworded.csv";
  const fileContent = fs.readFileSync(csvFilePath, { encoding: "utf-8" });

  parse(
    fileContent,
    {
      delimiter: ",",
      columns: true,
    },
    async (error, result: Data[]) => {
      console.error(error);
      mail(result.filter((u) => ["C422"].includes(u.username))[0]);
      const answer = await new Promise((resolve) => {
        rl.question(`Found ${result.length} documents containing user and password. Send? (y/n) `, resolve);
      });

      if (answer !== `y`) return;

      for (const user of result) {
        await mail(user);
        await sleep(1000);
      }

      console.log(`Finished.`);
    },
  );
})();
