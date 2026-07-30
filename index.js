const { Login } = require("./auth");
const axios = require("axios");
const fs = require("fs");
const readline = require("readline");

(async () => {
    try {
        let savedAuth = null;

        if (fs.existsSync("deviceAuth.json")) {
            try {
                savedAuth = JSON.parse(fs.readFileSync("deviceAuth.json", "utf8"));
            } catch {
                console.warn("Invalid JSON, will re-login…");
                savedAuth = null;
            }
        }

        if (savedAuth) {
            const headers = {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: "Basic M2Y2OWU1NmM3NjQ5NDkyYzhjYzI5ZjFhZjA4YThhMTI6YjUxZWU5Y2IxMjIzNGY1MGE2OWVmYTY3ZWY1MzgxMmU=",
            };

            try {
                const { data } = await axios.post(
                    "https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token",
                    new URLSearchParams({
                        grant_type: "device_auth",
                        account_id: savedAuth.accountId,
                        device_id: savedAuth.deviceId,
                        secret: savedAuth.secret,
                        token_type: "eg1",
                    }),
                    { headers }
                );
                savedAuth = data;
            } catch {
                console.warn("Device auth expired, re-logging…");
                savedAuth = null;
            }
        }

        if (!savedAuth) savedAuth = await Login();

        const request = await axios.get(`https://account-public-service-prod.ol.epicgames.com/account/api/oauth/exchange`, {
            headers: {
                Authorization: `Bearer ${savedAuth.access_token}`,
            },
        });

        const { data: tokenResponse2 } = await axios.post("https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token", new URLSearchParams({ grant_type: "exchange_code", exchange_code: request.data.code }).toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic M2UxM2M1YzU3ZjU5NGE1NzhhYmU1MTZlZWNiNjczZmU6NTMwZTMxNmMzMzdlNDA5ODkzYzU1ZWM0NGYyMmNkNjI=` },
        });

        savedAuth = tokenResponse2;

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        const mapCode = await new Promise((resolve) =>
            rl.question("Enter the map code: ", (answer) => {
                rl.close();
                resolve(answer.trim());
            })
        );
        if (!mapCode) throw new Error("Map code cannot be empty");

        const { data: mappingsData } = await axios.get("https://export-service-new.dillyapis.com/v1/mappings");
        const versionMatch = mappingsData?.version.match(/Release-(\d+)\.(\d+)-CL-(\d+)/);
        const [major, minor, cl] = versionMatch.slice(1);

        const { data } = await axios.get(`https://content-service.bfda.live.use1a.on.epicgames.com/api/content/v4/cooked-content-package/link/${mapCode}?role=client&platform=windows&major=${major}&minor=${minor}&patch=${cl}`, {
            headers: { Authorization: `bearer ${savedAuth.access_token}` },
        });

        if (data.isEncrypted) {
            const keyResponse = await axios.post("https://content-service.bfda.live.use1a.on.epicgames.com/api/content/v4/module/key/batch", [{ moduleId: data.resolved.root.moduleId, version: data.resolved.root.version }], {
                headers: {
                    Authorization: `bearer ${savedAuth.access_token || savedAuth.secret}`,
                    "Content-Type": "application/json",
                },
            });
            console.log(`AES Key: 0x${Buffer.from(keyResponse.data[0].key.Key, "base64").toString("hex").toUpperCase()}`);
            console.log(`GUID: ${keyResponse.data[0].key.Guid}`);
        } else {
            console.error("Map is not encrypted");
        }
    } catch (err) {
        if (err.response?.data?.errorCode === "errors.com.epicgames.content-service.unexpected_link_type") {
            console.error("1.0 maps have no encryption and can't be downloaded");
        } else {
            console.error("Error:", err.response?.data || err.message || err);
        }
    }
})();
