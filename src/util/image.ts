import {type Color} from '@maplibre/maplibre-gl-style-spec';
import {register} from './web_worker_transfer';

export type Size = {
    width: number;
    height: number;
};

type Point2D = {
    x: number;
    y: number;
};

function createImage(image: any, {
    width,
    height
}: Size, channels: number, data?: Uint8Array | Uint8ClampedArray) {
    if (!data) {
        data = new Uint8Array(width * height * channels);
    } else if (data instanceof Uint8ClampedArray) {
        data = new Uint8Array(data.buffer);
    } else if (data.length !== width * height * channels) {
        throw new RangeError(`mismatched image size. expected: ${data.length} but got: ${width * height * channels}`);
    }
    image.width = width;
    image.height = height;
    image.data = data;
    return image;
}

function resizeImage(image: any, {
    width,
    height
}: Size, channels: number) {
    if (width === image.width && height === image.height) {
        return;
    }

    const newImage = createImage({}, {width, height}, channels);

    copyImage(image, newImage, {x: 0, y: 0}, {x: 0, y: 0}, {
        width: Math.min(image.width, width),
        height: Math.min(image.height, height)
    }, channels);

    image.width = width;
    image.height = height;
    image.data = newImage.data;
}

function copyImage(srcImg: any, dstImg: any, srcPt: Point2D, dstPt: Point2D, size: Size, channels: number) {
    if (size.width === 0 || size.height === 0) {
        return dstImg;
    }

    if (size.width > srcImg.width ||
        size.height > srcImg.height ||
        srcPt.x > srcImg.width - size.width ||
        srcPt.y > srcImg.height - size.height) {
        throw new RangeError('out of range source coordinates for image copy');
    }

    if (size.width > dstImg.width ||
        size.height > dstImg.height ||
        dstPt.x > dstImg.width - size.width ||
        dstPt.y > dstImg.height - size.height) {
        throw new RangeError('out of range destination coordinates for image copy');
    }

    const srcData = srcImg.data;
    const dstData = dstImg.data;

    if (srcData === dstData) throw new Error('srcData equals dstData, so image is already copied');

    for (let y = 0; y < size.height; y++) {
        const srcOffset = ((srcPt.y + y) * srcImg.width + srcPt.x) * channels;
        const dstOffset = ((dstPt.y + y) * dstImg.width + dstPt.x) * channels;
        for (let i = 0; i < size.width * channels; i++) {
            dstData[dstOffset + i] = srcData[srcOffset + i];
        }
    }
    return dstImg;
}

/**
 * An image with alpha color value
 */
export class AlphaImage {
    width: number;
    height: number;
    data: Uint8Array;

    constructor(size: Size, data?: Uint8Array | Uint8ClampedArray) {
        createImage(this, size, 1, data);
    }

    resize(size: Size) {
        resizeImage(this, size, 1);
    }

    clone() {
        return new AlphaImage({width: this.width, height: this.height}, new Uint8Array(this.data));
    }

    static copy(srcImg: AlphaImage, dstImg: AlphaImage, srcPt: Point2D, dstPt: Point2D, size: Size) {
        copyImage(srcImg, dstImg, srcPt, dstPt, size, 1);
    }
}

/**
 * An object to store image data not premultiplied, because ImageData is not premultiplied.
 * UNPACK_PREMULTIPLY_ALPHA_WEBGL must be used when uploading to a texture.
 */
export class RGBAImage {
    width: number;
    height: number;

    /**
     * data must be a Uint8Array instead of Uint8ClampedArray because texImage2D does not support Uint8ClampedArray in all browsers.
     */
    data: Uint8Array;

    constructor(size: Size, data?: Uint8Array | Uint8ClampedArray) {
        createImage(this, size, 4, data);
    }

    resize(size: Size) {
        resizeImage(this, size, 4);
    }

    replace(data: Uint8Array | Uint8ClampedArray, copy?: boolean) {
        if (copy) {
            this.data.set(data);
        } else if (data instanceof Uint8ClampedArray) {
            this.data = new Uint8Array(data.buffer);
        } else {
            this.data = data;
        }
    }

    clone() {
        return new RGBAImage({width: this.width, height: this.height}, new Uint8Array(this.data));
    }

    static copy(srcImg: RGBAImage | ImageData, dstImg: RGBAImage, srcPt: Point2D, dstPt: Point2D, size: Size) {
        copyImage(srcImg, dstImg, srcPt, dstPt, size, 4);
    }

    setPixel(row: number, col: number, value: Color) {
        const rLocation = (row * this.width + col) * 4;
        this.data[rLocation + 0] = Math.round(value.r * 255 / value.a);
        this.data[rLocation + 1] = Math.round(value.g * 255 / value.a);
        this.data[rLocation + 2] = Math.round(value.b * 255 / value.a);
        this.data[rLocation + 3] = Math.round(value.a * 255);
    }
}

register('AlphaImage', AlphaImage);
register('RGBAImage', RGBAImage);
