// Deterministic yt-dlp stub for E2E tests (never touches the network).
//
// Compiled to a native stub-ytdlp.exe by global-setup.ts using the .NET
// Framework C# compiler that ships with Windows (no extra toolchain needed).
// A real .exe is required because asyncio.create_subprocess_exec on modern
// Python refuses .cmd/.bat wrappers - and cmd.exe would misinterpret the
// '|' characters inside yt-dlp's --progress-template arguments.
//
// Mimics the exact CLI surface backend/app/services/media_service.py uses:
//   --version                 -> prints a fake version
//   --dump-single-json ...    -> prints fixed metadata JSON
//   download mode             -> emits __P__ progress lines, writes
//                                e2e-video.mp4(.part) into the -P directory
using System;
using System.IO;
using System.Threading;

class Stub {
    const string INFO_JSON =
        "{\"_type\":\"video\",\"id\":\"e2e1\",\"title\":\"E2E Stub Video\"," +
        "\"uploader\":\"Stub Channel\",\"duration\":12,\"thumbnail\":\"\"," +
        "\"is_live\":false,\"extractor_key\":\"E2EStub\"," +
        "\"webpage_url\":\"https://93.184.216.34/e2e.mp4\",\"formats\":[" +
        "{\"format_id\":\"v720\",\"ext\":\"mp4\",\"url\":\"http://stub/v720\"," +
        "\"vcodec\":\"avc1.64001f\",\"acodec\":\"mp4a.40.2\",\"height\":720," +
        "\"width\":1280,\"fps\":30,\"tbr\":1000,\"abr\":null,\"filesize\":40000," +
        "\"filesize_approx\":40000,\"format_note\":\"\",\"resolution\":\"720p\"," +
        "\"protocol\":\"https\"}," +
        "{\"format_id\":\"a128\",\"ext\":\"m4a\",\"url\":\"http://stub/a128\"," +
        "\"vcodec\":\"none\",\"acodec\":\"mp4a.40.2\",\"height\":null," +
        "\"width\":null,\"fps\":null,\"tbr\":128,\"abr\":128,\"filesize\":8000," +
        "\"filesize_approx\":8000,\"format_note\":\"\",\"resolution\":\"audio only\"," +
        "\"protocol\":\"https\"}]}";

    static int Main(string[] args) {
        Thread.CurrentThread.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
        string joined = string.Join(" ", args);
        if (joined.Contains("--version")) {
            Console.Out.WriteLine("2026.01.01-e2e-stub");
            return 0;
        }
        if (joined.Contains("--dump-single-json")) {
            Console.Out.WriteLine(INFO_JSON);
            return 0;
        }

        string outDir = Directory.GetCurrentDirectory();
        for (int i = 0; i < args.Length - 1; i++) {
            if (args[i] == "-P") outDir = args[i + 1];
        }
        Directory.CreateDirectory(outDir);
        string part = Path.Combine(outDir, "e2e-video.mp4.part");
        string final = Path.Combine(outDir, "e2e-video.mp4");

        byte[] payload = new byte[40000];
        for (int i = 0; i < payload.Length; i++) {
            payload[i] = (byte)("E2E-STUB-MEDIA-BYTES|"[i % 20]);
        }
        int step = payload.Length / 4;
        int written = 0;
        using (FileStream f = new FileStream(part, FileMode.Create)) {
            for (int i = 0; i < 4; i++) {
                f.Write(payload, written, step);
                written += step;
                f.Flush();
                Console.Out.WriteLine("__P__" + written + "|" + payload.Length +
                                      "|" + payload.Length + "|7000|" + ((3 - i) * 1.4).ToString("0.0"));
                Console.Out.Flush();
                Thread.Sleep(2500);
            }
        }
        if (File.Exists(final)) File.Delete(final);
        File.Move(part, final);
        Console.Out.WriteLine("__POST__Merge|finished");
        return 0;
    }
}
