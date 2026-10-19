//#region node_modules/@ffmpeg/util/dist/esm/errors.js
var ERROR_RESPONSE_BODY_READER = /* @__PURE__ */ new Error("failed to get response body reader");
var ERROR_INCOMPLETED_DOWNLOAD = /* @__PURE__ */ new Error("failed to complete download");
//#endregion
//#region node_modules/@ffmpeg/util/dist/esm/index.js
/**
* Download content of a URL with progress.
*
* Progress only works when Content-Length is provided by the server.
*
*/
var downloadWithProgress = async (url, cb) => {
	const resp = await fetch(url);
	let buf;
	try {
		const total = parseInt(resp.headers.get("Content-Length") || "-1");
		const reader = resp.body?.getReader();
		if (!reader) throw ERROR_RESPONSE_BODY_READER;
		const chunks = [];
		let received = 0;
		for (;;) {
			const { done, value } = await reader.read();
			const delta = value ? value.length : 0;
			if (done) {
				if (total != -1 && total !== received) throw ERROR_INCOMPLETED_DOWNLOAD;
				cb && cb({
					url,
					total,
					received,
					delta,
					done
				});
				break;
			}
			chunks.push(value);
			received += delta;
			cb && cb({
				url,
				total,
				received,
				delta,
				done
			});
		}
		const data = new Uint8Array(received);
		let position = 0;
		for (const chunk of chunks) {
			data.set(chunk, position);
			position += chunk.length;
		}
		buf = data.buffer;
	} catch (e) {
		console.log(`failed to send download progress event: `, e);
		buf = await resp.arrayBuffer();
		cb && cb({
			url,
			total: buf.byteLength,
			received: buf.byteLength,
			delta: 0,
			done: true
		});
	}
	return buf;
};
/**
* toBlobURL fetches data from an URL and return a blob URL.
*
* Example:
*
* ```ts
* await toBlobURL("http://localhost:3000/ffmpeg.js", "text/javascript");
* ```
*/
var toBlobURL = async (url, mimeType, progress = false, cb) => {
	const buf = progress ? await downloadWithProgress(url, cb) : await (await fetch(url)).arrayBuffer();
	const blob = new Blob([buf], { type: mimeType });
	return URL.createObjectURL(blob);
};
//#endregion
export { toBlobURL as t };
