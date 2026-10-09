#ifdef _WIN32

#include <napi.h>
#include <windows.h>
#include <sddl.h>
#include <io.h>     // _open_osfhandle
#include <fcntl.h>  // _O_RDWR
#include <string>

// Get the SID string for the current process user.
static std::string GetCurrentUserSid() {
    HANDLE token = NULL;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) {
        throw std::runtime_error("OpenProcessToken failed: " + std::to_string(GetLastError()));
    }

    DWORD size = 0;
    GetTokenInformation(token, TokenUser, NULL, 0, &size);
    if (GetLastError() != ERROR_INSUFFICIENT_BUFFER) {
        CloseHandle(token);
        throw std::runtime_error("GetTokenInformation sizing failed: " + std::to_string(GetLastError()));
    }

    std::vector<BYTE> buffer(size);
    if (!GetTokenInformation(token, TokenUser, buffer.data(), size, &size)) {
        CloseHandle(token);
        throw std::runtime_error("GetTokenInformation failed: " + std::to_string(GetLastError()));
    }
    CloseHandle(token);

    TOKEN_USER* tokenUser = reinterpret_cast<TOKEN_USER*>(buffer.data());
    LPSTR sidString = NULL;
    if (!ConvertSidToStringSidA(tokenUser->User.Sid, &sidString)) {
        throw std::runtime_error("ConvertSidToStringSid failed: " + std::to_string(GetLastError()));
    }

    std::string result(sidString);
    LocalFree(sidString);
    return result;
}

// createSecurePipe(pipeName: string): number
//
// Creates a named pipe \\.\pipe\<pipeName> with:
//   - Owner-only DACL (current user SID + SYSTEM, deny all others)
//   - FILE_FLAG_FIRST_PIPE_INSTANCE (prevents pipe squatting)
//   - FILE_FLAG_OVERLAPPED (required for async I/O with net.Server)
//
// Returns a C runtime file descriptor suitable for net.Server.listen({ fd }).
static Napi::Value CreateSecurePipe(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected pipe name as string argument").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string pipeName = info[0].As<Napi::String>().Utf8Value();
    std::string fullPipePath = "\\\\.\\pipe\\" + pipeName;

    // Build SDDL: Protected DACL granting Generic All to owner SID and SYSTEM
    std::string userSid;
    try {
        userSid = GetCurrentUserSid();
    } catch (const std::runtime_error& e) {
        Napi::Error::New(env, std::string("Failed to get current user SID: ") + e.what())
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // D:P  — Protected DACL (no inheritance)
    // (A;;GA;;;{SID}) — Allow Generic All to the current user
    // (A;;GA;;;SY)    — Allow Generic All to SYSTEM
    std::string sddl = "D:P(A;;GA;;;" + userSid + ")(A;;GA;;;SY)";

    PSECURITY_DESCRIPTOR sd = NULL;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorA(
            sddl.c_str(), SDDL_REVISION_1, &sd, NULL)) {
        Napi::Error::New(env, "Failed to create security descriptor from SDDL: " +
            std::to_string(GetLastError())).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    SECURITY_ATTRIBUTES sa = {};
    sa.nLength = sizeof(SECURITY_ATTRIBUTES);
    sa.lpSecurityDescriptor = sd;
    sa.bInheritHandle = FALSE;

    // Convert pipe path to wide string
    int wideLen = MultiByteToWideChar(CP_UTF8, 0, fullPipePath.c_str(), -1, NULL, 0);
    std::wstring widePipePath(wideLen, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, fullPipePath.c_str(), -1, &widePipePath[0], wideLen);

    HANDLE pipeHandle = CreateNamedPipeW(
        widePipePath.c_str(),
        PIPE_ACCESS_DUPLEX | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
        PIPE_UNLIMITED_INSTANCES,
        65536,  // output buffer size
        65536,  // input buffer size
        0,      // default timeout
        &sa
    );

    LocalFree(sd);

    if (pipeHandle == INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        std::string msg = "CreateNamedPipeW failed: " + std::to_string(err);
        if (err == ERROR_ACCESS_DENIED) {
            msg += " (pipe may already exist — FILE_FLAG_FIRST_PIPE_INSTANCE rejected)";
        }
        Napi::Error::New(env, msg).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    // Convert the Windows HANDLE to a C runtime file descriptor so Node can use it
    int fd = _open_osfhandle(reinterpret_cast<intptr_t>(pipeHandle), _O_RDWR);
    if (fd == -1) {
        CloseHandle(pipeHandle);
        Napi::Error::New(env, "Failed to convert pipe handle to file descriptor")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Napi::Number::New(env, fd);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("createSecurePipe", Napi::Function::New(env, CreateSecurePipe));
    return exports;
}

NODE_API_MODULE(secure_pipe, Init)

#endif // _WIN32
