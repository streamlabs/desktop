{
  "targets": [{
    "target_name": "secure_pipe",
    "sources": ["src/secure_pipe.cc"],
    "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
    "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
    "conditions": [
      ["OS=='win'", {
        "libraries": ["-ladvapi32"]
      }]
    ]
  }]
}
