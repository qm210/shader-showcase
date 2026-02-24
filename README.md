# GLSL Shader Showcase

needs minimal dependencies and WebGL2.
- Which you probably support: https://caniuse.com/webgl2
- https://registry.khronos.org/webgl/specs/latest/2.0/
- WebGL2 matches OpenGL ES 3.0, thus our shaders want `#version 300 es`

## Get it running
Once:

`npm install`

then run the vite dev server via

`npm run dev`

and open http://localhost:5173

## How to use

This project is for visualizing shaders next to their source code.
There is no editor (for such thing, check https://www.shadertoy.com/),
but as this dev server supports Hot Module Reloading, just edit the source files,
and see the effects on the fly. 

These files are most relevant
```
/src/showcases.js
-- Is the map of existing showcases, switchable via their number in the URL path

/src/showcases/<number>_<name>.js
-- These are the showcases' WebGL setup part. They import some shaders (.glsl files)

/src/shaders/*.glsl
-- These are all the shaders. Look at the showcase .js file to see which one you want. 
```
Everything else is application code. While I wrote this in vanilla JS
to be more comprehensible by novices, it has grown quite a bit,
so in case you are confused, just ask your local Dr. Weinreuter for anything.

## Troubleshooting
* Windows Terminal / PowerShell Complaints about Execution Policy? Run as Admin:
```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Useful stuff 
- https://www.khronos.org/files/opengles3-quick-reference-card.pdf
- https://www.shadertoy.com/
- https://graphtoy-plus.csprance.com/
- https://iquilezles.org/articles/distfunctions2d/