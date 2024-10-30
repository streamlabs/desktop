// An abstraction on electron Menus

import * as remote from '@electron/remote';

export class Menu {
  menu: Electron.Menu;

  constructor() {
    this.menu = new remote.Menu();
  }

  popup() {
    this.menu.popup({ window: remote.getCurrentWindow() });
  }

  append(options: Electron.MenuItemConstructorOptions) {
    this.menu.append(new remote.MenuItem(options));
  }

  destroy() {
    this.menu.items.forEach((item: any) => {
      if (item.submenu && item.submenu.destroy) item.submenu.destroy();
    });
    (this.menu as any).destroy();
  }
}
