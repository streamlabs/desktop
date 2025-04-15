/**
 * Meant to look like a subset of https://github.com/stackgl/gl-texture2d
 * but doesn't require ndarray library that requires unsafe-eval to run.
 */
export class Texture2D {
  private texture: WebGLTexture;

  constructor(
    private gl: WebGLRenderingContext,
    private width: number,
    private height: number,
    data: Buffer,
  ) {
    const texture = this.gl.createTexture();
    if (!texture) throw new Error('Failed to initialize WebGL texture!');
    this.texture = texture;

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.width,
      this.height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      data,
    );
  }

  get shape(): [number, number] {
    return [this.width, this.height];
  }

  bind(texUnit: number) {
    this.gl.activeTexture(this.gl.TEXTURE0 + texUnit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    return this.gl.getParameter(this.gl.ACTIVE_TEXTURE) - this.gl.TEXTURE0;
  }

  dispose() {
    this.gl.deleteTexture(this.texture);
  }
}
