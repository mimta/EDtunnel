// _worker.js
import { connect } from "cloudflare:sockets";
var userID = "d342d11e-d424-4583-b36e-524ab1f0afa4";
var proxyIPs = ["23.162.136.169", "cdn.xn--b6gac.eu.org", "cdn-all.xn--b6gac.eu.org", "edgetunnel.anycast.eu.org"];
var proxyIP = proxyIPs[Math.floor(Math.random() * proxyIPs.length)];
var dohURL = "https://sky.rethinkdns.com/1:-Pf_____9_8A_AMAIgE8kMABVDDmKOHTAKg=";
if (!isValidUUID(userID)) {
  throw new Error("uuid is invalid");
}
var worker_default = {
  /**
   * @param {import("@cloudflare/workers-types").Request} request
   * @param {{UUID: string, PROXYIP: string, DNS_RESOLVER_URL: string, NODE_ID: int, API_HOST: string, API_TOKEN: string}} env
   * @param {import("@cloudflare/workers-types").ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    try {
      userID = env.UUID || userID;
      proxyIP = env.PROXYIP || proxyIP;
      dohURL = env.DNS_RESOLVER_URL || dohURL;
      let userID_Path = userID;
      if (userID.includes(",")) {
        userID_Path = userID.split(",")[0];
      }
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader !== "websocket") {
        const url = new URL(request.url);
        switch (url.pathname) {
          case "/cf":
            return new Response(JSON.stringify(request.cf, null, 4), {
              status: 200,
              headers: {
                "Content-Type": "application/json;charset=utf-8"
              }
            });
          case `/${userID_Path}`: {
            const vlessConfig = getVLESSConfig(userID, request.headers.get("Host"));
            return new Response(`${vlessConfig}`, {
              status: 200,
              headers: {
                "Content-Type": "text/html; charset=utf-8"
              }
            });
          }
          case `/sub/${userID_Path}`: {
            const url2 = new URL(request.url);
            const searchParams = url2.searchParams;
            let vlessConfig = createVLESSSub(userID, request.headers.get("Host"));
            if (searchParams.get("format") === "text") {
              vlessConfig = vlessConfig;
            }
            return new Response(btoa(vlessConfig), {
              status: 200,
              headers: {
                "Content-Type": "text/plain;charset=utf-8"
              }
            });
          }
          case `/bestip/${userID_Path}`: {
            const bestiplink = `https://sub.xf.free.hr/auto?host=${request.headers.get("Host")}&uuid=${userID_Path}`;
            const reqHeaders = new Headers(request.headers);
            const bestipresponse = await fetch(bestiplink, { redirect: "manual", headers: reqHeaders });
            return bestipresponse;
          }
          default:
            const hostnames = ["www.fmprc.gov.cn", "www.xuexi.cn", "www.gov.cn", "mail.gov.cn", "www.mofcom.gov.cn", "www.gfbzb.gov.cn", "www.miit.gov.cn", "www.12377.cn"];
            url.hostname = hostnames[Math.floor(Math.random() * hostnames.length)];
            url.protocol = "https:";
            const newHeaders = new Headers(request.headers);
            newHeaders.set("cf-connecting-ip", newHeaders.get("x-forwarded-for") || newHeaders.get("cf-connecting-ip"));
            newHeaders.set("x-forwarded-for", newHeaders.get("cf-connecting-ip"));
            newHeaders.set("x-real-ip", newHeaders.get("cf-connecting-ip"));
            newHeaders.set("referer", "https://www.google.com/q=edtunnel");
            request = new Request(url, {
              method: request.method,
              headers: newHeaders,
              body: request.body,
              redirect: request.redirect
            });
            const cache = caches.default;
            let response = await cache.match(request);
            if (!response) {
              try {
                response = await fetch(request, { redirect: "manual" });
              } catch (err) {
                url.protocol = "http:";
                url.hostname = hostnames[Math.floor(Math.random() * hostnames.length)];
                request = new Request(url, {
                  method: request.method,
                  headers: newHeaders,
                  body: request.body,
                  redirect: request.redirect
                });
                response = await fetch(request, { redirect: "manual" });
              }
              const cloneResponse = response.clone();
              ctx.waitUntil(cache.put(request, cloneResponse));
            }
            return response;
        }
      } else {
        return await vlessOverWSHandler(request);
      }
    } catch (err) {
      let e = err;
      return new Response(e.toString());
    }
  }
};
async function uuid_validator(request) {
  const hostname = request.headers.get("Host");
  const currentDate = /* @__PURE__ */ new Date();
  const subdomain = hostname.split(".")[0];
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");
  const formattedDate = `${year}-${month}-${day}`;
  const hashHex = await hashHex_f(subdomain);
  console.log(hashHex, subdomain, formattedDate);
}
async function hashHex_f(string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(string);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return hashHex;
}
async function vlessOverWSHandler(request) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();
  let address = "";
  let portWithRandomLog = "";
  let currentDate = /* @__PURE__ */ new Date();
  const log = (info, event) => {
    console.log(`[${currentDate} ${address}:${portWithRandomLog}] ${info}`, event || "");
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || "";
  const readableWebSocketStream = makeReadableWebSocketStream(webSocket, earlyDataHeader, log);
  let remoteSocketWapper = {
    value: null
  };
  let udpStreamWrite = null;
  let isDns = false;
  readableWebSocketStream.pipeTo(new WritableStream({
    async write(chunk, controller) {
      if (isDns && udpStreamWrite) {
        return udpStreamWrite(chunk);
      }
      if (remoteSocketWapper.value) {
        const writer = remoteSocketWapper.value.writable.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
        return;
      }
      const {
        hasError,
        message,
        portRemote = 443,
        addressRemote = "",
        rawDataIndex,
        vlessVersion = new Uint8Array([0, 0]),
        isUDP
      } = processVlessHeader(chunk, userID);
      address = addressRemote;
      portWithRandomLog = `${portRemote} ${isUDP ? "udp" : "tcp"} `;
      if (hasError) {
        throw new Error(message);
        return;
      }
      if (isUDP && portRemote !== 53) {
        throw new Error("UDP proxy only enabled for DNS which is port 53");
      }
      if (isUDP && portRemote === 53) {
        isDns = true;
      }
      const vlessResponseHeader = new Uint8Array([vlessVersion[0], 0]);
      const rawClientData = chunk.slice(rawDataIndex);
      if (isDns) {
        const { write } = await handleUDPOutBound(webSocket, vlessResponseHeader, log);
        udpStreamWrite = write;
        udpStreamWrite(rawClientData);
        return;
      }
      handleTCPOutBound(remoteSocketWapper, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log);
    },
    close() {
      log(`readableWebSocketStream is close`);
    },
    abort(reason) {
      log(`readableWebSocketStream is abort`, JSON.stringify(reason));
    }
  })).catch((err) => {
    log("readableWebSocketStream pipeTo error", err);
  });
  return new Response(null, {
    status: 101,
    webSocket: client
  });
}
async function handleTCPOutBound(remoteSocket, addressRemote, portRemote, rawClientData, webSocket, vlessResponseHeader, log) {
  async function connectAndWrite(address, port) {
    const tcpSocket2 = connect({
      hostname: address,
      port
    });
    remoteSocket.value = tcpSocket2;
    log(`connected to ${address}:${port}`);
    const writer = tcpSocket2.writable.getWriter();
    await writer.write(rawClientData);
    writer.releaseLock();
    return tcpSocket2;
  }
  async function retry() {
    const tcpSocket2 = await connectAndWrite(proxyIP || addressRemote, portRemote);
    tcpSocket2.closed.catch((error) => {
      console.log("retry tcpSocket closed error", error);
    }).finally(() => {
      safeCloseWebSocket(webSocket);
    });
    remoteSocketToWS(tcpSocket2, webSocket, vlessResponseHeader, null, log);
  }
  const tcpSocket = await connectAndWrite(addressRemote, portRemote);
  remoteSocketToWS(tcpSocket, webSocket, vlessResponseHeader, retry, log);
}
function makeReadableWebSocketStream(webSocketServer, earlyDataHeader, log) {
  let readableStreamCancel = false;
  const stream = new ReadableStream({
    start(controller) {
      webSocketServer.addEventListener("message", (event) => {
        const message = event.data;
        controller.enqueue(message);
      });
      webSocketServer.addEventListener("close", () => {
        safeCloseWebSocket(webSocketServer);
        controller.close();
      });
      webSocketServer.addEventListener("error", (err) => {
        log("webSocketServer has error");
        controller.error(err);
      });
      const { earlyData, error } = base64ToArrayBuffer(earlyDataHeader);
      if (error) {
        controller.error(error);
      } else if (earlyData) {
        controller.enqueue(earlyData);
      }
    },
    pull(controller) {
    },
    cancel(reason) {
      log(`ReadableStream was canceled, due to ${reason}`);
      readableStreamCancel = true;
      safeCloseWebSocket(webSocketServer);
    }
  });
  return stream;
}
function processVlessHeader(vlessBuffer, userID2) {
  if (vlessBuffer.byteLength < 24) {
    return {
      hasError: true,
      message: "invalid data"
    };
  }
  const version = new Uint8Array(vlessBuffer.slice(0, 1));
  let isValidUser = false;
  let isUDP = false;
  const slicedBuffer = new Uint8Array(vlessBuffer.slice(1, 17));
  const slicedBufferString = stringify(slicedBuffer);
  const uuids = userID2.includes(",") ? userID2.split(",") : [userID2];
  isValidUser = uuids.some((userUuid) => slicedBufferString === userUuid.trim()) || uuids.length === 1 && slicedBufferString === uuids[0].trim();
  console.log(`userID: ${slicedBufferString}`);
  if (!isValidUser) {
    return {
      hasError: true,
      message: "invalid user"
    };
  }
  const optLength = new Uint8Array(vlessBuffer.slice(17, 18))[0];
  const command = new Uint8Array(
    vlessBuffer.slice(18 + optLength, 18 + optLength + 1)
  )[0];
  if (command === 1) {
    isUDP = false;
  } else if (command === 2) {
    isUDP = true;
  } else {
    return {
      hasError: true,
      message: `command ${command} is not support, command 01-tcp,02-udp,03-mux`
    };
  }
  const portIndex = 18 + optLength + 1;
  const portBuffer = vlessBuffer.slice(portIndex, portIndex + 2);
  const portRemote = new DataView(portBuffer).getUint16(0);
  let addressIndex = portIndex + 2;
  const addressBuffer = new Uint8Array(
    vlessBuffer.slice(addressIndex, addressIndex + 1)
  );
  const addressType = addressBuffer[0];
  let addressLength = 0;
  let addressValueIndex = addressIndex + 1;
  let addressValue = "";
  switch (addressType) {
    case 1:
      addressLength = 4;
      addressValue = new Uint8Array(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      ).join(".");
      break;
    case 2:
      addressLength = new Uint8Array(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + 1)
      )[0];
      addressValueIndex += 1;
      addressValue = new TextDecoder().decode(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      break;
    case 3:
      addressLength = 16;
      const dataView = new DataView(
        vlessBuffer.slice(addressValueIndex, addressValueIndex + addressLength)
      );
      const ipv6 = [];
      for (let i = 0; i < 8; i++) {
        ipv6.push(dataView.getUint16(i * 2).toString(16));
      }
      addressValue = ipv6.join(":");
      break;
    default:
      return {
        hasError: true,
        message: `invild  addressType is ${addressType}`
      };
  }
  if (!addressValue) {
    return {
      hasError: true,
      message: `addressValue is empty, addressType is ${addressType}`
    };
  }
  return {
    hasError: false,
    addressRemote: addressValue,
    addressType,
    portRemote,
    rawDataIndex: addressValueIndex + addressLength,
    vlessVersion: version,
    isUDP
  };
}
async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, retry, log) {
  let remoteChunkCount = 0;
  let chunks = [];
  let vlessHeader = vlessResponseHeader;
  let hasIncomingData = false;
  await remoteSocket.readable.pipeTo(
    new WritableStream({
      start() {
      },
      /**
       * 
       * @param {Uint8Array} chunk 
       * @param {*} controller 
       */
      async write(chunk, controller) {
        hasIncomingData = true;
        remoteChunkCount++;
        if (webSocket.readyState !== WS_READY_STATE_OPEN) {
          controller.error(
            "webSocket.readyState is not open, maybe close"
          );
        }
        if (vlessHeader) {
          webSocket.send(await new Blob([vlessHeader, chunk]).arrayBuffer());
          vlessHeader = null;
        } else {
          webSocket.send(chunk);
        }
      },
      close() {
        log(`remoteConnection!.readable is close with hasIncomingData is ${hasIncomingData}`);
      },
      abort(reason) {
        console.error(`remoteConnection!.readable abort`, reason);
      }
    })
  ).catch((error) => {
    console.error(
      `remoteSocketToWS has exception `,
      error.stack || error
    );
    safeCloseWebSocket(webSocket);
  });
  if (hasIncomingData === false && retry) {
    log(`retry`);
    retry();
  }
}
function base64ToArrayBuffer(base64Str) {
  if (!base64Str) {
    return { earlyData: null, error: null };
  }
  try {
    base64Str = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    const decode = atob(base64Str);
    const arryBuffer = Uint8Array.from(decode, (c) => c.charCodeAt(0));
    return { earlyData: arryBuffer.buffer, error: null };
  } catch (error) {
    return { earlyData: null, error };
  }
}
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
var WS_READY_STATE_OPEN = 1;
var WS_READY_STATE_CLOSING = 2;
function safeCloseWebSocket(socket) {
  try {
    if (socket.readyState === WS_READY_STATE_OPEN || socket.readyState === WS_READY_STATE_CLOSING) {
      socket.close();
    }
  } catch (error) {
    console.error("safeCloseWebSocket error", error);
  }
}
var byteToHex = [];
for (let i = 0; i < 256; ++i) {
  byteToHex.push((i + 256).toString(16).slice(1));
}
function unsafeStringify(arr, offset = 0) {
  return (byteToHex[arr[offset + 0]] + byteToHex[arr[offset + 1]] + byteToHex[arr[offset + 2]] + byteToHex[arr[offset + 3]] + "-" + byteToHex[arr[offset + 4]] + byteToHex[arr[offset + 5]] + "-" + byteToHex[arr[offset + 6]] + byteToHex[arr[offset + 7]] + "-" + byteToHex[arr[offset + 8]] + byteToHex[arr[offset + 9]] + "-" + byteToHex[arr[offset + 10]] + byteToHex[arr[offset + 11]] + byteToHex[arr[offset + 12]] + byteToHex[arr[offset + 13]] + byteToHex[arr[offset + 14]] + byteToHex[arr[offset + 15]]).toLowerCase();
}
function stringify(arr, offset = 0) {
  const uuid = unsafeStringify(arr, offset);
  if (!isValidUUID(uuid)) {
    throw TypeError("Stringified UUID is invalid");
  }
  return uuid;
}
async function handleUDPOutBound(webSocket, vlessResponseHeader, log) {
  let isVlessHeaderSent = false;
  const transformStream = new TransformStream({
    start(controller) {
    },
    transform(chunk, controller) {
      for (let index = 0; index < chunk.byteLength; ) {
        const lengthBuffer = chunk.slice(index, index + 2);
        const udpPakcetLength = new DataView(lengthBuffer).getUint16(0);
        const udpData = new Uint8Array(
          chunk.slice(index + 2, index + 2 + udpPakcetLength)
        );
        index = index + 2 + udpPakcetLength;
        controller.enqueue(udpData);
      }
    },
    flush(controller) {
    }
  });
  transformStream.readable.pipeTo(new WritableStream({
    async write(chunk) {
      const resp = await fetch(
        dohURL,
        // dns server url
        {
          method: "POST",
          headers: {
            "content-type": "application/dns-message"
          },
          body: chunk
        }
      );
      const dnsQueryResult = await resp.arrayBuffer();
      const udpSize = dnsQueryResult.byteLength;
      const udpSizeBuffer = new Uint8Array([udpSize >> 8 & 255, udpSize & 255]);
      if (webSocket.readyState === WS_READY_STATE_OPEN) {
        log(`doh success and dns message length is ${udpSize}`);
        if (isVlessHeaderSent) {
          webSocket.send(await new Blob([udpSizeBuffer, dnsQueryResult]).arrayBuffer());
        } else {
          webSocket.send(await new Blob([vlessResponseHeader, udpSizeBuffer, dnsQueryResult]).arrayBuffer());
          isVlessHeaderSent = true;
        }
      }
    }
  })).catch((error) => {
    log("dns udp has error" + error);
  });
  const writer = transformStream.writable.getWriter();
  return {
    /**
     * 
     * @param {Uint8Array} chunk 
     */
    write(chunk) {
      writer.write(chunk);
    }
  };
}
function getVLESSConfig(userIDs, hostName) {
  const commonUrlPart = `:443?encryption=none&security=tls&sni=${hostName}&fp=randomized&type=ws&host=${hostName}&path=%2F%3Fed%3D2048#${hostName}`;
  const separator = "---------------------------------------------------------------";
  const hashSeparator = "################################################################";
  let userIDArray = userIDs.split(",");
  let output = [];
  let header = [];
  const sublink = `https://${hostName}/sub/${userIDArray[0]}`;
  const clash_link = `https://subconverter.do.xn--b6gac.eu.org/sub?target=clash&url=${encodeURIComponent(sublink)}&insert=false&emoji=true&list=false&tfo=false&scv=true&fdn=false&sort=false&new_name=true`;
  header.push(`
<b style=" font-size: 15px;" >Welcome! This function generates configuration for VLESS protocol. If you found this useful, please check our GitHub project for more:</b>
`);
  header.push(``);
  userIDArray.forEach((userID2) => {
    const vlessMain = `vless://${userID2}@${hostName}${commonUrlPart}`;
    const vlessSec = `vless://${userID2}@${proxyIP}${commonUrlPart}`;
    output.push(`UUID: ${userID2}`);
    output.push(`${hashSeparator}
v2ray default ip
${separator}
${vlessMain}
${separator}`);
    output.push(`${hashSeparator}
v2ray with best ip
${separator}
${vlessSec}
${separator}`);
  });
  output.push(`${hashSeparator}
# Clash Proxy Provider \u914D\u7F6E\u683C\u5F0F(configuration format)
proxy-groups:
  - name: UseProvider
	type: select
	use:
	  - provider1
	proxies:
	  - Proxy
	  - DIRECT
proxy-providers:
  provider1:
	type: http
	url: https://${hostName}/sub/${userIDArray[0]}?format=clash
	interval: 3600
	path: ./provider1.yaml
	health-check:
	  enable: true
	  interval: 600
	  # lazy: true
	  url: http://www.gstatic.com/generate_204

${hashSeparator}`);
  const htmlHead = `
    <head>
        <title>EDtunnel: VLESS configuration</title>
        <meta name="description" content="This is a tool for generating VLESS protocol configurations. Give us a star on GitHub https://github.com/3Kmfi6HP/EDtunnel if you found it useful!">
		<meta name="keywords" content="EDtunnel, cloudflare pages, cloudflare worker, severless">
        <meta name="viewport" content="width=device-width, initial-scale=1">
		<meta property="og:site_name" content="EDtunnel: VLESS configuration" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="EDtunnel - VLESS configuration and subscribe output" />
        <meta property="og:description" content="Use cloudflare pages and worker severless to implement vless protocol" />
        <meta property="og:url" content="https://${hostName}/" />
        <meta property="og:image" content="https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`vless://${userIDs.split(",")[0]}@${hostName}${commonUrlPart}`)}" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="EDtunnel - VLESS configuration and subscribe output" />
        <meta name="twitter:description" content="Use cloudflare pages and worker severless to implement vless protocol" />
        <meta name="twitter:url" content="https://${hostName}/" />
        <meta name="twitter:image" content="https://cloudflare-ipfs.com/ipfs/bafybeigd6i5aavwpr6wvnwuyayklq3omonggta4x2q7kpmgafj357nkcky" />
        <meta property="og:image:width" content="1500" />
        <meta property="og:image:height" content="1500" />

        <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
            color: #333;
            padding: 10px;
        }

        a {
            color: #1a0dab;
            text-decoration: none;
        }
		img {
			max-width: 100%;
			height: auto;
		}
		
        pre {
            white-space: pre-wrap;
            word-wrap: break-word;
            background-color: #fff;
            border: 1px solid #ddd;
            padding: 15px;
            margin: 10px 0;
        }
		/* Dark mode */
        @media (prefers-color-scheme: dark) {
            body {
                background-color: #333;
                color: #f0f0f0;
            }

            a {
                color: #9db4ff;
            }

            pre {
                background-color: #282a36;
                border-color: #6272a4;
            }
        }
        </style>
    </head>
    `;
  return `
    <html>
    ${htmlHead}
    <body>
    <pre style="
    background-color: transparent;
    border: none;
">${header.join("")}</pre><pre>${output.join("\n")}</pre>
    </body>
</html>`;
}
function createVLESSSub(userID_Path, hostName) {
  let portArray_http = [80, 8080, 8880, 2052, 2086, 2095, 2082];
  let portArray_https = [443, 8443, 2053, 2096, 2087, 2083];
  let userIDArray = userID_Path.includes(",") ? userID_Path.split(",") : [userID_Path];
  let output = [];
  userIDArray.forEach((userID2) => {
    if (!hostName.includes("pages.dev")) {
      portArray_http.forEach((port) => {
        const commonUrlPart_http = `:${port}?encryption=none&security=none&fp=random&type=ws&host=${hostName}&path=%2F%3Fed%3D2048#${hostName}-HTTP-${port}`;
        const vlessMainHttp = `vless://${userID2}@${hostName}${commonUrlPart_http}`;
        proxyIPs.forEach((proxyIP2) => {
          const vlessSecHttp = `vless://${userID2}@${proxyIP2}${commonUrlPart_http}-${proxyIP2}-EDtunnel`;
          output.push(`${vlessMainHttp}`);
          output.push(`${vlessSecHttp}`);
        });
      });
    }
    portArray_https.forEach((port) => {
      const commonUrlPart_https = `:${port}?encryption=none&security=tls&sni=${hostName}&fp=random&type=ws&host=${hostName}&path=%2F%3Fed%3D2048#${hostName}-HTTPS-${port}`;
      const vlessMainHttps = `vless://${userID2}@${hostName}${commonUrlPart_https}`;
      proxyIPs.forEach((proxyIP2) => {
        const vlessSecHttps = `vless://${userID2}@${proxyIP2}${commonUrlPart_https}-${proxyIP2}-EDtunnel`;
        output.push(`${vlessMainHttps}`);
        output.push(`${vlessSecHttps}`);
      });
    });
  });
  return output.join("\n");
}
export {
  worker_default as default,
  hashHex_f,
  uuid_validator
};
//# sourceMappingURL=_worker.js.map
