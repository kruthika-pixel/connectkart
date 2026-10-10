const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const path = require("path");
const cors = require("cors");


require("dotenv").config({
path: path.resolve(__dirname, ".env")
});

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 2000;
const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS || "")
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean)
);

const corsOptions = {
    origin(origin, callback) {
        if (
            !origin ||
            allowedOrigins.has(origin) ||
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));

app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            reply: "Request body must be valid JSON."
        });
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            reply: "Request body is too large."
        });
    }

    return next(error);
});

app.get("/data/server.js", (req, res) => {
    res.sendStatus(404);
});

app.use(express.static(path.resolve(__dirname, "..")));

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

console.log("Gemini API key loaded:", Boolean(apiKey));

app.get("/health", (req, res) => {
res.json({
server: "running",
geminiConfigured: Boolean(apiKey)
});
});

app.post("/chat", async (req, res) => {
const userMessage = typeof req.body?.message === "string"
    ? req.body.message.trim()
    : "";

if (!userMessage) {
    return res.status(400).json({
        reply: "Please enter a message."
    });
}

if (userMessage.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
        reply: `Please keep your message under ${MAX_MESSAGE_LENGTH} characters.`
    });
}

if (!ai) {
    return res.status(503).json({
        reply: "Gemini is not configured. Please check your .env file."
    });
}

try {
    const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || "gemini-3.8-flash",
        httpOptions: {
            retryOptions: {
                attempts: 3,
                initialDelay: 1,
                maxDelay: 3,
                httpStatusCodes: [503]
            }
        },
        contents:
            "You are ConnectKart's helpful AI assistant. " +
            "ConnectKart helps customers find discounted food and products, " +
            "helps restaurants sell surplus food, supports food donations, " +
            "and connects donors with NGOs and people in need. " +
            "Answer clearly and politely. " +
            "User: " + userMessage
    });

    const reply = response.text;

    if (!reply) {
        return res.status(502).json({
            reply: "Gemini returned an empty response. Please try again."
        });
    }

    return res.json({ reply });

} catch (error) {
    const status = Number(error?.status || error?.code);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Gemini API request failed:", error);
    console.error(
        "Gemini error status:",
        status || "Unknown"
    );

    const isQuotaExhausted = status === 429 &&
        /RESOURCE_EXHAUSTED|quota exceeded/i.test(errorMessage);
    const isTemporarilyUnavailable = status === 503 || (status === 429 && !isQuotaExhausted);
    const reply = isQuotaExhausted
        ? "The Gemini API quota for this project is exhausted. Check its quota or billing settings, or try again after the quota resets."
        : isTemporarilyUnavailable
        ? "Gemini is temporarily busy or rate-limited. Please try again shortly."
        : status === 401 || status === 403
            ? "Gemini could not authorize the request. Check the API key in data/.env."
            : "Gemini AI could not respond. Please check the VS Code terminal.";

    const responseStatus = isQuotaExhausted
        ? 429
        : isTemporarilyUnavailable
            ? 503
            : status === 401 || status === 403
                ? status
                : 500;

    return res.status(responseStatus).json({
        reply
    });
}

});

app.listen(PORT, () => {
console.log(`ConnectKart server running at http://localhost:${PORT}`);
});
