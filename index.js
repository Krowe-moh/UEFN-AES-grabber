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
                Authorization: "Basic OThmN2U0MmMyZTNhNGY4NmE3NGViNDNmYmI0MWVkMzk6MGEyNDQ5YTItMDAxYS00NTFlLWFmZWMtM2U4MTI5MDFjNGQ3",
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
                console.log(data);
                savedAuth = data;
            } catch {
                console.warn("Device auth expired, re-logging…");
                savedAuth = null;
            }
        }

        if (!savedAuth) savedAuth = await Login();
                console.log(savedAuth);

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

        const { data: mappingsData } = await axios.get("https://fortnitecentral.genxgames.gg/api/v1/mappings");
        const versionMatch = mappingsData[0]?.meta?.version?.match(/Release-(\d+)\.(\d+)-CL-(\d+)/);
        const [major, minor, cl] = versionMatch.slice(1);

        const { data } = await axios.get(`https://content-service.bfda.live.use1a.on.epicgames.com/api/content/v2/link/${mapCode}/cooked-content-package?role=client&platform=windows&major=${major}&minor=${minor}&patch=${cl}`, {
            headers: { Authorization: `bearer ${savedAuth.access_token}` },
        });

        if (data.isEncrypted) {
            const keyResponse = await axios.post("https://content-service.bfda.live.use1a.on.epicgames.com/api/content/v4/module/key/batch", [{ moduleId: data.resolved.root.moduleId, version: data.resolved.root.version }], {
                headers: {
                    Authorization: `bearer ${savedAuth.access_token || savedAuth.secret}`,
                    "Content-Type": "application/json",
                },
            });
            console.log(`AES: 0x${Buffer.from(keyResponse.data[0].key.Key, "base64").toString("hex").toUpperCase()}`);
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