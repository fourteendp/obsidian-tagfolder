import { ItemView, Menu, Notice } from 'obsidian';
import { mount } from 'svelte';
import TagFolderPlugin from './main';
import {
  OrderDirection,
  OrderKeyItem,
  OrderKeyTag,
  VIEW_TYPE_TAGFOLDER,
  VIEW_TYPE_TAGFOLDER_LINK,
  VIEW_TYPE_TAGFOLDER_LIST,
  type TagFolderSettings,
  type ViewItem,
} from './types';
import { maxDepth, selectedTags } from './store';
import {
  ancestorToLongestTag,
  ancestorToTags,
  isSpecialTag,
  renderSpecialTag,
  joinPartialPath,
  removeIntermediatePath,
  trimTrailingSlash,
} from './util';
import { askString } from 'dialog';

function toggleObjectProp(obj: { [key: string]: any }, propName: string, value: string | false) {
  if (value === false) {
    const newTagInfoEntries = Object.entries(obj || {}).filter(([key]) => key != propName);
    if (newTagInfoEntries.length == 0) {
      return {};
    } else {
      return Object.fromEntries(newTagInfoEntries);
    }
  } else {
    return { ...(obj ?? {}), [propName]: value };
  }
}
export abstract class TagFolderViewBase extends ItemView {
  component!: ReturnType<typeof mount>;
  plugin!: TagFolderPlugin;
  navigation = false;
  async saveSettings(settings: TagFolderSettings) {
    this.plugin.settings = { ...this.plugin.settings, ...settings };
    await this.plugin.saveSettings();
    this.plugin.updateFileCaches();
  }
  showOrder(evt: MouseEvent) {
    const menu = new Menu();

    menu.addItem((item) => {
      item
        .setTitle('标签')
        .setIcon('hashtag')
        .onClick((evt2) => {
          const menu2 = new Menu();
          for (const key in OrderKeyTag) {
            for (const direction in OrderDirection) {
              menu2.addItem((item) => {
                const newSetting = `${key}_${direction}`;
                item.setTitle(OrderKeyTag[key] + ' ' + OrderDirection[direction]).onClick(async () => {
                  //@ts-ignore
                  this.plugin.settings.sortTypeTag = newSetting;
                  await this.plugin.saveSettings();
                });
                if (newSetting == this.plugin.settings.sortTypeTag) {
                  item.setIcon('checkmark');
                }
                return item;
              });
            }
          }
          menu2.showAtPosition({ x: evt.x, y: evt.y });
        });
      return item;
    });
    menu.addItem((item) => {
      item
        .setTitle('项目')
        .setIcon('document')
        .onClick((evt2) => {
          const menu2 = new Menu();
          for (const key in OrderKeyItem) {
            for (const direction in OrderDirection) {
              menu2.addItem((item) => {
                const newSetting = `${key}_${direction}`;
                item.setTitle(OrderKeyItem[key] + ' ' + OrderDirection[direction]).onClick(async () => {
                  //@ts-ignore
                  this.plugin.settings.sortType = newSetting;
                  await this.plugin.saveSettings();
                });
                if (newSetting == this.plugin.settings.sortType) {
                  item.setIcon('checkmark');
                }
                return item;
              });
            }
          }
          menu2.showAtPosition({ x: evt.x, y: evt.y });
        });
      return item;
    });
    menu.showAtMouseEvent(evt);
  }

  showLevelSelect(evt: MouseEvent) {
    const menu = new Menu();
    const setLevel = async (level: number) => {
      this.plugin.settings.expandLimit = level;
      await this.plugin.saveSettings();
      maxDepth.set(level);
    };
    for (const level of [2, 3, 4, 5]) {
      menu.addItem((item) => {
        item.setTitle(`层级 ${level - 1}`).onClick(() => {
          void setLevel(level);
        });
        if (this.plugin.settings.expandLimit == level) item.setIcon('checkmark');
        return item;
      });
    }

    menu.addItem((item) => {
      item
        .setTitle('无限制')
        // .setIcon("hashtag")
        .onClick(() => {
          void setLevel(0);
        });
      if (this.plugin.settings.expandLimit == 0) item.setIcon('checkmark');

      return item;
    });
    menu.showAtMouseEvent(evt);
  }

  refreshTree(evt: MouseEvent) {
    evt.preventDefault();
    this.plugin.refreshAllTree();
    new Notice('标签树已刷新');
  }

  abstract getViewType(): string;

  showMenu(evt: MouseEvent, trail: string[], targetTag?: string, targetItems?: ViewItem[]) {
    const isTagTree = this.getViewType() == VIEW_TYPE_TAGFOLDER;
    const menu = new Menu();
    if (isTagTree) {
      const expandedTagsAll = ancestorToLongestTag(ancestorToTags(joinPartialPath(removeIntermediatePath(trail)))).map(
        (e) => trimTrailingSlash(e)
      );
      const expandedTags = expandedTagsAll
        .map((e) =>
          e
            .split('/')
            .filter((ee) => !isSpecialTag(ee))
            .join('/')
        )
        .filter((e) => e != '')
        .map((e) => '#' + e)
        .join(' ')
        .trim();
      const displayExpandedTags = expandedTagsAll
        .map((e) =>
          e
            .split('/')
            .filter((ee) => renderSpecialTag(ee))
            .join('/')
        )
        .filter((e) => e != '')
        .map((e) => '#' + e)
        .join(' ')
        .trim();

      if (navigator && navigator.clipboard) {
        menu.addItem((item) =>
          item
            .setTitle(`复制标签:${expandedTags}`)
            .setIcon('hashtag')
            .onClick(async () => {
              await navigator.clipboard.writeText(expandedTags);
              new Notice('Copied');
            })
        );
      }
      menu.addItem((item) =>
        item
          .setTitle(`新建笔记:${targetTag ? '关联此标签' : '包含类似标签'}`)
          .setIcon('create-new')
          .onClick(async () => {
            await this.plugin.createNewNote(trail);
          })
      );
      if (targetTag) {
        if (this.plugin.settings.useTagInfo && this.plugin.tagInfo != null) {
          const tag = targetTag;

          if (tag in this.plugin.tagInfo && 'key' in this.plugin.tagInfo[tag]) {
            menu.addItem((item) =>
              item
                .setTitle(`取消固定`)
                .setIcon('pin')
                .onClick(async () => {
                  this.plugin.tagInfo[tag] = toggleObjectProp(this.plugin.tagInfo[tag], 'key', false);
                  this.plugin.applyTagInfo();
                  await this.plugin.saveTagInfo();
                })
            );
          } else {
            menu.addItem((item) => {
              item
                .setTitle(`固定`)
                .setIcon('pin')
                .onClick(async () => {
                  this.plugin.tagInfo[tag] = toggleObjectProp(this.plugin.tagInfo[tag], 'key', '');
                  this.plugin.applyTagInfo();
                  await this.plugin.saveTagInfo();
                });
            });
          }
          menu.addItem((item) => {
            item
              .setTitle(`设置标签别名`)
              .setIcon('pencil')
              .onClick(async () => {
                const oldAlt = tag in this.plugin.tagInfo ? (this.plugin.tagInfo[tag].alt ?? '') : '';
                const label = await askString(this.app, '设置标签别名:', '', oldAlt);
                if (label === false) return;
                this.plugin.tagInfo[tag] = toggleObjectProp(
                  this.plugin.tagInfo[tag],
                  'alt',
                  label == '' ? false : label
                );
                this.plugin.applyTagInfo();
                await this.plugin.saveTagInfo();
              });
          });
          menu.addItem((item) => {
            item
              .setTitle(`更改标记样式`)
              .setIcon('pencil')
              .onClick(async () => {
                const oldMark = tag in this.plugin.tagInfo ? (this.plugin.tagInfo[tag].mark ?? '') : '';
                const mark = await askString(this.app, '更改标记样式:', '', oldMark);
                if (mark === false) return;
                this.plugin.tagInfo[tag] = toggleObjectProp(
                  this.plugin.tagInfo[tag],
                  'mark',
                  mark == '' ? false : mark
                );
                this.plugin.applyTagInfo();
                await this.plugin.saveTagInfo();
              });
          });
          menu.addItem((item) => {
            item
              .setTitle(`将此标签重定向至 ...`)
              .setIcon('pencil')
              .onClick(async () => {
                const oldRedirect = tag in this.plugin.tagInfo ? (this.plugin.tagInfo[tag].redirect ?? '') : '';
                const redirect = await askString(this.app, '将此标签重定向至:', '', oldRedirect);
                if (redirect === false) return;
                this.plugin.tagInfo[tag] = toggleObjectProp(
                  this.plugin.tagInfo[tag],
                  'redirect',
                  redirect == '' ? false : redirect
                );
                this.plugin.applyTagInfo();
                await this.plugin.saveTagInfo();
              });
          });
          if (targetItems) {
            menu.addItem((item) => {
              item
                .setTitle(`打开滚动浏览视图`)
                .setIcon('sheets-in-box')
                .onClick(async () => {
                  const files = targetItems.map((e) => e.path);
                  await this.plugin.openScrollView(undefined, displayExpandedTags, expandedTagsAll.join(', '), files);
                });
            });
            menu.addItem((item) => {
              item
                .setTitle(`打开列表视图`)
                .setIcon('sheets-in-box')
                .onClick(() => {
                  selectedTags.set(expandedTagsAll);
                });
            });
          }
        }
      }
    }
    if (!targetTag && targetItems && targetItems.length == 1) {
      const path = targetItems[0].path;
      const file = this.app.vault.getAbstractFileByPath(path);
      // Trigger
      this.app.workspace.trigger('file-menu', menu, file, 'file-explorer');
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(`在新标签页打开`)
          .setSection('open')
          .setIcon('lucide-file-plus')
          .onClick(async () => {
            await this.app.workspace.openLinkText(path, path, 'tab');
          })
      );
      menu.addItem((item) =>
        item
          .setTitle(`在右侧打开`)
          .setSection('open')
          .setIcon('lucide-separator-vertical')
          .onClick(async () => {
            await this.app.workspace.openLinkText(path, path, 'split');
          })
      );
    } else if (!isTagTree && targetTag) {
      const path = targetTag;
      const file = this.app.vault.getAbstractFileByPath(path);
      // Trigger
      this.app.workspace.trigger('file-menu', menu, file, 'file-explorer');
      menu.addSeparator();
      menu.addItem((item) =>
        item
          .setTitle(`在新标签页打开`)
          .setSection('open')
          .setIcon('lucide-file-plus')
          .onClick(async () => {
            await this.app.workspace.openLinkText(path, path, 'tab');
          })
      );
      menu.addItem((item) =>
        item
          .setTitle(`在右侧打开`)
          .setSection('open')
          .setIcon('lucide-separator-vertical')
          .onClick(async () => {
            await this.app.workspace.openLinkText(path, path, 'split');
          })
      );
    }
    if ('screenX' in evt) {
      menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
    } else {
      menu.showAtPosition({
        // @ts-ignore
        x: evt.nativeEvent.locationX,
        // @ts-ignore
        y: evt.nativeEvent.locationY,
      });
    }
    evt.preventDefault();
    // menu.showAtMouseEvent(evt);
  }

  switchView() {
    let viewType = VIEW_TYPE_TAGFOLDER;
    const currentType = this.getViewType();
    if (currentType == VIEW_TYPE_TAGFOLDER) {
      viewType = VIEW_TYPE_TAGFOLDER_LIST;
    } else if (currentType == VIEW_TYPE_TAGFOLDER_LINK) {
      return;
    } else if (currentType == VIEW_TYPE_TAGFOLDER_LIST) {
      viewType = VIEW_TYPE_TAGFOLDER;
    }

    const leaves = this.app.workspace
      .getLeavesOfType(viewType)
      .filter((e) => !e.getViewState().pinned && e != this.leaf);
    if (leaves.length) {
      void this.app.workspace.revealLeaf(leaves[0]);
    }
  }
}
