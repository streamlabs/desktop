import { get, invert, set } from 'lodash';

// This class is used for simplifying math that deals
// with rectangles that can be scaled, including
// negative scales.

export enum ResizeBoxPoint {
  North,
  NorthEast,
  East,
  SouthEast,
  South,
  SouthWest,
  West,
  NorthWest,
  Center,
}

export enum CenteringAxis {
  X,
  Y,
  Both,
}

// Positions on a positive unit grid
const AnchorPositions = {
  [ResizeBoxPoint.North]: { x: 0.5, y: 0 },
  [ResizeBoxPoint.NorthEast]: { x: 1, y: 0 },
  [ResizeBoxPoint.East]: { x: 1, y: 0.5 },
  [ResizeBoxPoint.SouthEast]: { x: 1, y: 1 },
  [ResizeBoxPoint.South]: { x: 0.5, y: 1 },
  [ResizeBoxPoint.SouthWest]: { x: 0, y: 1 },
  [ResizeBoxPoint.West]: { x: 0, y: 0.5 },
  [ResizeBoxPoint.NorthWest]: { x: 0, y: 0 },
  [ResizeBoxPoint.Center]: { x: 0.5, y: 0.5 },
};

export class ScalableRectangle implements IScalableRectangle {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  width: number;
  height: number;
  crop: ICrop;
  rotation: number;

  private anchor: ResizeBoxPoint;

  constructor(options: IScalableRectangle) {
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;
    this.scaleX = options.scaleX || 1.0;
    this.scaleY = options.scaleY || 1.0;

    this.crop = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      ...options.crop,
    };

    this.rotation = options.rotation || 0;

    this.anchor = ResizeBoxPoint.NorthWest;
  }

  get croppedWidth() {
    return this.width - this.crop.left - this.crop.right;
  }

  get croppedHeight() {
    return this.height - this.crop.top - this.crop.bottom;
  }

  get scaledWidth() {
    return this.scaleX * this.croppedWidth;
  }

  get scaledHeight() {
    return this.scaleY * this.croppedHeight;
  }

  get aspectRatio() {
    return this.width / this.height;
  }

  get scaledAspectRatio() {
    return this.scaledWidth / this.scaledHeight;
  }

  setAnchor(anchor: ResizeBoxPoint) {
    // We need to calculate the distance to the new anchor point
    const currentPosition = AnchorPositions[this.anchor];
    const newPosition = AnchorPositions[anchor];

    const deltaX = newPosition.x - currentPosition.x;
    const deltaY = newPosition.y - currentPosition.y;

    this.x += deltaX * this.scaledWidth;
    this.y += deltaY * this.scaledHeight;

    this.anchor = anchor;
  }

  /**
   * Adjust width, height, position, and crop to make this appear
   * like an unrotated object to the rest of the code.
   * Note that this only works on 90 degree increments of rotation.
   * @returns a function to undo the operation.
   */
  private zeroRotation() {
    // A set a fields to map values
    const mapFields: Dictionary<string> = {};

    // This is where the anchor point would actually be if this
    // were a zero rotated object
    let anchor = ResizeBoxPoint.NorthWest;

    if (this.rotation === 90) {
      mapFields['width'] = 'height';
      mapFields['height'] = 'width';
      mapFields['scaleX'] = 'scaleY';
      mapFields['scaleY'] = 'scaleX';
      mapFields['crop.top'] = 'crop.left';
      mapFields['crop.right'] = 'crop.top';
      mapFields['crop.bottom'] = 'crop.right';
      mapFields['crop.left'] = 'crop.bottom';
      anchor = ResizeBoxPoint.NorthEast;
    } else if (this.rotation === 180) {
      mapFields['crop.top'] = 'crop.bottom';
      mapFields['crop.right'] = 'crop.left';
      mapFields['crop.bottom'] = 'crop.top';
      mapFields['crop.left'] = 'crop.right';
      anchor = ResizeBoxPoint.SouthEast;
    } else if (this.rotation === 270) {
      mapFields['width'] = 'height';
      mapFields['height'] = 'width';
      mapFields['scaleX'] = 'scaleY';
      mapFields['scaleY'] = 'scaleX';
      mapFields['crop.top'] = 'crop.right';
      mapFields['crop.right'] = 'crop.bottom';
      mapFields['crop.bottom'] = 'crop.left';
      mapFields['crop.left'] = 'crop.top';
      anchor = ResizeBoxPoint.SouthWest;
    }

    this.mapFields(mapFields);

    this.anchor = anchor;

    // Return the anchor to the NW, since the editor code assumes
    // that all rectangles are anchored from the NW
    this.setAnchor(ResizeBoxPoint.NorthWest);

    const rotation = this.rotation;
    this.rotation = 0;

    // Return a function to undo these operations in the reverse order
    return () => {
      this.rotation = rotation;
      this.setAnchor(anchor);
      this.mapFields(invert(mapFields));
    };
  }

  private mapFields(fields: Dictionary<string>) {
    const currentValues: any = {};

    Object.keys(fields).forEach(key => {
      currentValues[key] = get(this, fields[key]);
    });

    Object.keys(fields).forEach(key => {
      set(this, key, currentValues[key]);
    });
  }

  /**
   * Executes the function with a specific anchor point, after
   * which it is returned to its original anchor point.
   */
  withAnchor(anchor: ResizeBoxPoint, fun: Function) {
    const oldAnchor = this.anchor;
    this.setAnchor(anchor);

    fun();

    this.setAnchor(oldAnchor);
  }

  /**
   * Normalizes this rectangle into a rectangle that does not
   * have any negative scales.
   * @returns a function that can be used to undo the operation.
   */
  normalize(): () => void {
    const derotate = this.zeroRotation();

    const xFlipped = this.scaleX < 0;
    const yFlipped = this.scaleY < 0;

    if (xFlipped) this.flipX();
    if (yFlipped) this.flipY();

    return () => {
      if (xFlipped) this.flipX();
      if (yFlipped) this.flipY();
      derotate();
    };
  }

  /**
   * This is a convenience method that will run the passed
   * function in a normalized environment, and then return
   * it back to its original state afterwards.
   */
  normalized(fun: Function) {
    const denormalize = this.normalize();

    fun();

    denormalize();
  }

  flipX() {
    this.scaleX *= -1;
    this.x -= this.scaledWidth;

    const leftCrop = this.crop.left;
    this.crop.left = this.crop.right;
    this.crop.right = leftCrop;
  }

  flipY() {
    this.scaleY *= -1;
    this.y -= this.scaledHeight;

    const topCrop = this.crop.top;
    this.crop.top = this.crop.bottom;
    this.crop.bottom = topCrop;
  }

  /**
   * Stretches this rectangle across the provided
   * rectangle.  Aspect ratio may not be preserved.
   */
  stretchAcross(rect: ScalableRectangle) {
    // Normalize both rectangles for this operation
    this.normalized(() =>
      rect.normalized(() => {
        this.x = rect.x;
        this.y = rect.y;
        this.scaleX = rect.scaledWidth / this.croppedWidth;
        this.scaleY = rect.scaledHeight / this.croppedHeight;
      }),
    );
  }

  /**
   * Fits this rectangle inside the provided rectangle
   * while preserving the aspect ratio of this rectangle.
   */
  fitTo(rect: ScalableRectangle) {
    // Normalize both rectangles for this operation
    this.normalized(() =>
      rect.normalized(() => {
        if (this.aspectRatio > rect.scaledAspectRatio) {
          this.scaleX = rect.scaledWidth / this.croppedWidth;
          this.scaleY = this.scaleX;
        } else {
          this.scaleY = rect.scaledHeight / this.croppedHeight;
          this.scaleX = this.scaleY;
        }

        this.centerOn(rect);
      }),
    );
  }

  /**
   * Centers this rectangle on the provided rectangle
   * without changing the scale.
   */
  centerOn(rect: ScalableRectangle, axis?: CenteringAxis) {
    // Normalize both rectangles for this operation
    this.normalized(() =>
      rect.normalized(() => {
        // Anchor both rectangles in the axis center
        this.withAnchor(ResizeBoxPoint.Center, () => {
          rect.withAnchor(ResizeBoxPoint.Center, () => {
            switch (axis) {
              case CenteringAxis.X:
                this.x = rect.x;
                break;
              case CenteringAxis.Y:
                this.y = rect.y;
                break;
              default:
                this.x = rect.x;
                this.y = rect.y;
            }
          });
        });
      }),
    );
  }
}
