// Firstly we imported required libraries--
// "express" is used as the web application framework.
// "fs" is used for file system operations.
// "path" is used to handle file paths.
// "authenticate" is a function from @google-cloud/local-auth@2.1.0 library to authenticate using local credentials.
// "google" is an object from the googleapis@105 library that provides access to Google APIs.

const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

// The port numnber for the server
const port = 3000;

// Here we create an instance of our Express Application
const app = express();

// The "SCOPES" array contains the permissions required by the Gmail API for reading emails, sending emails, and to manage labels.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://mail.google.com/",
];

// The name of the label that will be created for auto-replied emails 
const labelName = "AutoReplied";

// Here we define route handeler for the root endpoint("/")
app.get("/", async (req, res) => {
    // Authenticate using local credentials
    const auth = await authenticate({
      keyfilePath: path.join(__dirname, "credentials.json"),
      scopes: SCOPES,
    });
  
    // The "google.gmail" object is created with the authenticated client.
    const gmail = google.gmail({ version: "v1", auth });
  
    // Get the list of labels
    const response = await gmail.users.labels.list({
      userId: "me",
    });
  
    // Function to retrieves the unreplied messages from the "INBOX" label
    async function getUnrepliedMessages(auth) {
      const gmail = google.gmail({ version: "v1", auth });
      const response = await gmail.users.messages.list({
        userId: "me",
        labelIds: ["INBOX"],
        q: "is:unread",
      });
      return response.data.messages || [];
    }
  
    // Function checks if the "AutoReplied" label exists. If not, it creates the label with the specified visibility settings
    async function createLabel(auth) {
      const gmail = google.gmail({ version: "v1", auth });
      try {
        const response = await gmail.users.labels.create({
          userId: "me",
          requestBody: {
            name: labelName,
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          },
        });
        return response.data.id;
      } catch (error) {
        if (error.code === 409) {
          const response = await gmail.users.labels.list({
            userId: "me",
          });
          const label = response.data.labels.find(
            (label) => label.name === labelName
          );
          return label.id;
        } else {
          throw error;
        }
      }
    }
  
    // Main function to handle the auto-reply logic
    async function main() {
    //   It retrieves the label ID
      const labelId = await createLabel(auth);
  
    // sets an interval to check for unreplied messages at random intervals between 45 to 120 seconds
    // Inside this, it checks if there are any unreplied messages. 
    // For each message, it retrieves the message data and checks if it has a reply by inspecting the headers
      setInterval(async () => {
        const messages = await getUnrepliedMessages(auth);
        if (messages && messages.length > 0) {
          for (const message of messages) {
            const messageData = await gmail.users.messages.get({
              userId: "me",
              id: message.id,
            });
  
            const email = messageData.data;
            const hasReplied = email.payload.headers.some(
              (header) => header.name === "In-Reply-To"
            );
  
            if (!hasReplied) {
              const replyMessage = {
                userId: "me",
                requestBody: {
                  raw: Buffer.from(
                    `To: ${
                      email.payload.headers.find(
                        (header) => header.name === "From"
                      ).value || ""
                    }\r\n` +
                      `Subject: Re: ${
                        email.payload.headers.find(
                          (header) => header.name === "Subject"
                        )?.value || ""
                      }\r\n` +
                      `Content-Type: text/plain; charset="UTF-8"\r\n` +
                      `Content-Transfer-Encoding: 7bit\r\n\r\n` +
                      `Thank you for your email. I hope this message finds you well. I am currently on vacation and will be out of the office. During this time, I will have limited access to email and may not be able to respond immediately.\r\n`
                  ).toString("base64"),
                },
              };
  
              // Send the auto-reply message
              await gmail.users.messages.send(replyMessage);
  
              // Modify labels of the original message from "INBOX" to "AutoReplied"
              await gmail.users.messages.modify({
                userId: "me",
                id: message.id,
                requestBody: {
                  addLabelIds: [labelId],
                  removeLabelIds: ["INBOX"],
                },
              });
            }
          }
        }
      }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000);
    }
  
    // Call the main function to start the auto-reply process
    main();
  
    res.json({ "this is Auth": auth });
  });
  
  // Application start listening to the port: 3000
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
