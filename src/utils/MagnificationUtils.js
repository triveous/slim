/**
 * Magnification calculation utilities for DICOM WSI not used
 */

class MagnificationUtils {
  /**
   * Initialize with DICOM metadata
   * @param {Object} metadata - DICOM WSI metadata
   */
  constructor(metadata) {
    // Extract key values from DICOM metadata
    this.objectiveLensPower = this.extractObjectiveLensPower(metadata);
    this.pixelSpacing = this.extractPixelSpacing(metadata);
    this.totalPixelMatrixColumns = metadata.TotalPixelMatrixColumns;
    this.totalPixelMatrixRows = metadata.TotalPixelMatrixRows;
    this.pyramidLevels = this.extractPyramidLevels(metadata);
  }

  /**
   * Extract objective lens power from metadata
   */
  extractObjectiveLensPower(metadata) {
    // Try different possible locations
    if (metadata.ObjectiveLensPower) {
      return parseFloat(metadata.ObjectiveLensPower);
    }

    // Check in Optical Path Sequence
    if (
      metadata.OpticalPathSequence &&
      metadata.OpticalPathSequence[0] &&
      metadata.OpticalPathSequence[0].ObjectiveLensPower
    ) {
      return parseFloat(metadata.OpticalPathSequence[0].ObjectiveLensPower);
    }

    // Default fallback (common for pathology)
    console.warn("ObjectiveLensPower not found, defaulting to 40x");
    return 40;
  }

  /**
   * Extract pixel spacing (mm per pixel)
   */
  extractPixelSpacing(metadata) {
    // SharedFunctionalGroupsSequence contains PixelMeasuresSequence
    if (
      metadata.SharedFunctionalGroupsSequence &&
      metadata.SharedFunctionalGroupsSequence[0] &&
      metadata.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence &&
      metadata.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence[0]
    ) {
      const pixelMeasures =
        metadata.SharedFunctionalGroupsSequence[0].PixelMeasuresSequence[0];

      return {
        x: parseFloat(pixelMeasures.PixelSpacing[0]),
        y: parseFloat(pixelMeasures.PixelSpacing[1]),
      };
    }

    // Direct PixelSpacing
    if (metadata.PixelSpacing) {
      return {
        x: parseFloat(metadata.PixelSpacing[0]),
        y: parseFloat(metadata.PixelSpacing[1]),
      };
    }

    // Calculate from ImagedVolume and TotalPixelMatrix
    if (metadata.ImagedVolumeWidth && metadata.TotalPixelMatrixColumns) {
      const spacing =
        metadata.ImagedVolumeWidth / metadata.TotalPixelMatrixColumns;
      return { x: spacing, y: spacing };
    }

    // Default fallback (0.25 µm = 0.00025 mm for 40x scan)
    console.warn("PixelSpacing not found, using default");
    return { x: 0.00025, y: 0.00025 };
  }

  /**
   * Extract pyramid level information
   */
  extractPyramidLevels(metadata) {
    // This would come from parsing multiple resolution levels
    // Each level has its own SOP Instance
    return metadata.pyramidLevels || [];
  }

  /**
   * Calculate current magnification based on viewport
   *
   * @param {Object} viewport - OpenLayers viewport state
   * @param {number} viewportWidth - Viewer container width in pixels
   * @returns {Object} Magnification information
   */
  calculateMagnification(viewport, viewportWidth) {
    // Get current resolution (image units per viewport pixel)
    const resolution = viewport.getResolution();

    // At native resolution (resolution = 1), we're at full scan magnification
    // When resolution = 2, we're at half magnification, etc.
    const zoomFactor = 1 / resolution;

    // Current magnification
    const currentMagnification = this.objectiveLensPower * zoomFactor;

    // Calculate microns per pixel at current zoom
    const micronsPerPixel = (this.pixelSpacing.x * 1000) / zoomFactor;

    return {
      magnification: currentMagnification,
      magnificationFormatted: this.formatMagnification(currentMagnification),
      micronsPerPixel: micronsPerPixel,
      objectivePower: this.objectiveLensPower,
      zoomFactor: zoomFactor,
      resolution: resolution,
    };
  }

  /**
   * Format magnification for display
   */
  formatMagnification(mag) {
    if (mag >= 1) {
      if (mag >= 10) {
        return `${Math.round(mag)}x`;
      }
      return `${mag.toFixed(1)}x`;
    } else {
      return `${mag.toFixed(2)}x`;
    }
  }

  /**
   * Get scale bar information
   * Returns the appropriate scale bar length for current zoom
   */
  getScaleBar(viewport, viewportWidth) {
    const resolution = viewport.getResolution();
    const micronsPerViewportPixel = this.pixelSpacing.x * 1000 * resolution;

    // Target scale bar length in viewport pixels
    const targetBarPixels = 100;

    // Calculate what that represents in microns
    let microns = micronsPerViewportPixel * targetBarPixels;

    // Round to nice number
    const niceNumbers = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    let niceLength = niceNumbers.find((n) => n >= microns) || 5000;

    // Calculate actual bar width in pixels
    const barPixels = niceLength / micronsPerViewportPixel;

    // Format label
    let label;
    if (niceLength >= 1000) {
      label = `${niceLength / 1000} mm`;
    } else {
      label = `${niceLength} µm`;
    }

    return {
      widthPixels: barPixels,
      length: niceLength,
      label: label,
    };
  }
}

export default MagnificationUtils;
