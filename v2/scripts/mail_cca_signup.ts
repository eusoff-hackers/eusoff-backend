/* eslint-disable no-console */

/* eslint-disable no-restricted-syntax */

/* eslint-disable no-await-in-loop */
import type { iCca } from "@/v2/models/cca/cca";
import "@/v2/models/cca/cca";
import { CcaInfo } from "@/v2/models/cca/ccaInfo";
import { CcaSignup } from "@/v2/models/cca/ccaSignup";
import "@/v2/models/cca/ccaSubcommittee";
import type { iCcaSubcommittee } from "@/v2/models/cca/ccaSubcommittee";
import "@/v2/models/user";
import type { iUser } from "@/v2/models/user";
import mongoose from "mongoose";
import nodemailer from "nodemailer";
import { createInterface } from "readline";

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

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function mail(user: iUser) {
  try {
    const { username, email } = user;

    const signups = await CcaSignup.find({ user: user._id })
      .populate<{ cca: iCca }>(`cca`)
      .populate<{ subcommittees: iCcaSubcommittee[] }>(`subcommittees`);

    const info = await CcaInfo.findOne({ user: user._id });

    if (!info) throw new Error(`Cannot find info`);

    const template = `<!DOCTYPE html>
    <html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CCA signup info</title>
</head>


<body style="font-family: 'Roboto', Arial, sans-serif; margin: 0; padding: 0; background-color: #f7f7f7; color: #333;">

    <table width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#f7f7f7">
        <tr>
            <td align="center" valign="top" style="padding: 5% 10px;">
                <table width="600" border="0" cellspacing="0" cellpadding="20" bgcolor="#ffffff" style="border-radius: 8px; box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.1);">
                    <tr>
                        <td>
                            <h2 style="margin-bottom: 30px; color: #333;">Thank you for using our platform!</h2>
                            <p style="margin-bottom: 20px; color: #666; line-height: 1.6;">We have successfully received your CCA registration details. Below is a summary of your submission:</p>
                            <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 30px;">
                                <p style="margin: 0; color: #666; line-height: 1.6;"><strong>Name:</strong> ${
                                  info.name
                                }</p>
                                <p style="margin: 0; color: #666; line-height: 1.6;"><strong>Telegram Handle:</strong> ${
                                  info.telegram
                                }</p>
                                <p style="margin: 0; margin-top: 10px; color: #666; line-height: 1.6;"><strong>Registered CCAs:</strong></p>
                                <ul style="margin-top: 0; padding-left: 20px; color: #666; line-height: 1.6;">
                                    ${signups
                                      .map(
                                        (s) => `
                                    <li>
                                        <p style="margin: 0; color: #666; line-height: 1.6;"><strong>${
                                          s.cca.name
                                        }</strong></p>
                                        ${
                                          s.subcommittees.length > 0
                                            ? `<ol style="margin-top: 5px; padding-left: 20px;">${s.subcommittees
                                                .map((sub) => `<li>${sub.name}</li>`)
                                                .join("")}</ol>`
                                            : ""
                                        }
                                    </li>`,
                                      )
                                      .join("")}
                                </ul>
                            </div>
                            <p style="margin-bottom: 20px; color: #666; line-height: 1.6;">The CCA heads will reach out to you shortly regarding your registrations.</p>
                            <p style="margin-bottom: 20px; color: #666; line-height: 1.6;">Thank you for participating in the CCA sign-up. We apologize for any inconvenience and wish you a successful semester!</p>
                            <p style="margin-bottom: 30px; color: #aaa; line-height: 1.6;">If you received this email by mistake, please let us know by replying to this message.</p>
                            <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 20px 0;">
                            <p style="margin-bottom: 0; color: #aaa; line-height: 1.6;">Best of luck,<br>Eusoff Hackers</p>
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
      subject: "Your CCA Registration Details", // Subject line
      // text: mail.password, // plain text body
      html: template, // html body
    });
    console.log(`Email to ${username} sent.`);
  } catch (error) {
    console.error(`Mailing error `, error);
  }
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const users = await CcaInfo.find().populate<{ user: iUser }>(`user`);

  mail(users.filter((u) => u.user.username === "A0276140L")[0].user);
  const answer = await new Promise((resolve) => {
    rl.question(`Found ${users.length} allocations. Send? (y/n) `, resolve);
  });

  if (answer !== `y`) return;

  for (const user of users) {
    await mail(user.user);
  }
  console.log(`finished`);
})();
