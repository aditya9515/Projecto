const { WebpackPlugin } = require('@electron-forge/plugin-webpack');
const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('node:path');
const { version } = require('./package.json');

const iconPath = path.resolve(__dirname, 'assets', 'icon');
const windowsIconPath = path.resolve(__dirname, 'assets', 'icon.ico');
const windowsSigningConfig =
  process.env.WINDOWS_SIGN_WITH_PARAMS
    ? {
        signWithParams: process.env.WINDOWS_SIGN_WITH_PARAMS,
      }
    : process.env.WINDOWS_CODESIGN_CERTIFICATE_FILE &&
        process.env.WINDOWS_CODESIGN_CERTIFICATE_PASSWORD
      ? {
          certificateFile: process.env.WINDOWS_CODESIGN_CERTIFICATE_FILE,
          certificatePassword: process.env.WINDOWS_CODESIGN_CERTIFICATE_PASSWORD,
        }
      : {};

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'projecto',
    icon: iconPath,
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'projecto',
        setupIcon: windowsIconPath,
        setupExe: `Projecto-${version}.Setup.exe`,
        ...windowsSigningConfig,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new WebpackPlugin({
      mainConfig: './webpack.main.config.js',
      renderer: {
        config: './webpack.renderer.config.js',
        entryPoints: [
          {
            html: './src/renderer/index.html',
            js: './src/renderer/main.tsx',
            name: 'main_window',
            preload: {
              js: './src/preload/index.ts',
            },
          },
        ],
      },
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
