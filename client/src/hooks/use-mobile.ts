import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if the current device is mobile
 * Based on screen width and user agent detection
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // Check screen width
      const screenWidth = window.innerWidth <= 768;
      
      // Check user agent for mobile devices
      const userAgent = navigator.userAgent.toLowerCase();
      const mobileKeywords = [
        'android', 'webos', 'iphone', 'ipad', 'ipod', 
        'blackberry', 'windows phone', 'mobile'
      ];
      const isMobileUserAgent = mobileKeywords.some(keyword => 
        userAgent.includes(keyword)
      );
      
      // Check for touch capability
      const hasTouchScreen = 'ontouchstart' in window || 
                           navigator.maxTouchPoints > 0;
      
      // Combine checks - prioritize screen width but consider other factors
      const mobile = screenWidth || (isMobileUserAgent && hasTouchScreen);
      setIsMobile(mobile);
    };

    // Initial check
    checkMobile();

    // Add resize listener
    window.addEventListener('resize', checkMobile);
    
    // Add orientation change listener for mobile devices
    window.addEventListener('orientationchange', () => {
      // Delay to allow orientation change to complete
      setTimeout(checkMobile, 100);
    });

    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);

  return isMobile;
}

/**
 * Hook to get current screen orientation
 */
export function useOrientation() {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const updateOrientation = () => {
      if (screen.orientation) {
        setOrientation(screen.orientation.angle % 180 === 0 ? 'portrait' : 'landscape');
      } else {
        // Fallback for older browsers
        setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
      }
    };

    updateOrientation();
    window.addEventListener('orientationchange', updateOrientation);
    window.addEventListener('resize', updateOrientation);

    return () => {
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  return orientation;
}

/**
 * Hook to detect if device supports various mobile features
 */
export function useMobileFeatures() {
  const [features, setFeatures] = useState({
    hasCamera: false,
    hasGeolocation: false,
    hasVibration: false,
    hasDeviceMotion: false,
    hasTouchScreen: false,
    hasServiceWorker: false,
  });

  useEffect(() => {
    const checkFeatures = async () => {
      // Check camera access
      let hasCamera = false;
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          hasCamera = devices.some(device => device.kind === 'videoinput');
        }
      } catch (error) {
        // Camera not available or permission denied
      }

      setFeatures({
        hasCamera,
        hasGeolocation: 'geolocation' in navigator,
        hasVibration: 'vibrate' in navigator,
        hasDeviceMotion: 'DeviceMotionEvent' in window,
        hasTouchScreen: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        hasServiceWorker: 'serviceWorker' in navigator,
      });
    };

    checkFeatures();
  }, []);

  return features;
}