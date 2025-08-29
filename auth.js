const axios = require("axios");
const fs = require("fs");

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

async function Login() {
    const { data: tokenResponse } = await axios.post("https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token", new URLSearchParams({ grant_type: "client_credentials" }).toString(), {
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3` },
    });
    const { data: device } = await axios.post(
        "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/deviceAuthorization",
        { prompt: "login" },
        { headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${tokenResponse.access_token}` } }
    );

    console.log(`Authorize here ${device.verification_uri_complete}`);

    let token;
    const deadline = Date.now() + device.expires_in * 1000;
    while (Date.now() < deadline) {
        await sleep(device.interval * 100);

        try {
            const { data } = await axios.post(
                "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token",
                new URLSearchParams({
                    grant_type: "device_code",
                    device_code: device.device_code,
                }).toString(),
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Authorization: "Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3",
                    },
                }
            );
            token = data;
            break;
        } catch {
            // Ignore
        }
    }

    if (!token) throw new Error("Login timed out.");

    console.log(`Logged in as account ${token.displayName}`);

    const { data: deviceAuth } = await axios.post(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account/${token.account_id}/deviceAuth`, {}, { headers: { Authorization: `Bearer ${token.access_token}` } });

    const output = {
        displayName: token.displayName,
        accountId: token.account_id,
        deviceId: deviceAuth.deviceId,
        secret: deviceAuth.secret,
    };

    fs.writeFileSync("deviceAuth.json", JSON.stringify(output, null, 4));
    return token;
}

module.exports = { Login };