const { build } = require('electron-builder');
const path = require('path');

// Define build configuration
const config = {
  appId: 'com.fileatlas.app',
  productName: 'File Atlas',
  directories: {
    output: path.join(process.cwd(), 'dist'),
    app: path.join(process.cwd())
  },
  files: [
    'app/**/*',
    'security/**/*',
    'package.json'
  ],
  win: {
    target: ['nsis'],
    icon: path.join(process.cwd(), 'assets', 'icon.ico')
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true
  },
  mac: {
    target: ['dmg'],
    icon: path.join(process.cwd(), 'assets', 'icon.icns')
  },
  linux: {
    target: ['AppImage'],
    icon: path.join(process.cwd(), 'assets', 'icon.png')
  }
};

// Run the build process
build(config)
  .then(() => {
    console.log('Build completed successfully');
  })
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });