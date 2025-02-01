import { basename, join } from "path";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  DEFAULT_COLUMNS,
  type Columns as ColumnsObject,
} from "components/system/Files/FileManager/Columns/constants";
import FileEntry from "components/system/Files/FileEntry";
import StyledSelection from "components/system/Files/FileManager/Selection/StyledSelection";
import useSelection from "components/system/Files/FileManager/Selection/useSelection";
import useDraggableEntries from "components/system/Files/FileManager/useDraggableEntries";
import useFileDrop from "components/system/Files/FileManager/useFileDrop";
import useFileKeyboardShortcuts from "components/system/Files/FileManager/useFileKeyboardShortcuts";
import useFocusableEntries from "components/system/Files/FileManager/useFocusableEntries";
import useFolder from "components/system/Files/FileManager/useFolder";
import useFolderContextMenu from "components/system/Files/FileManager/useFolderContextMenu";
import {
  type FileManagerViewNames,
  FileManagerViews,
} from "components/system/Files/Views";
import { useFileSystem } from "contexts/fileSystem";
import {
  FOCUSABLE_ELEMENT,
  MOUNTABLE_EXTENSIONS,
  PREVENT_SCROLL,
  SHORTCUT_EXTENSION,
} from "utils/constants";
import { getExtension, haltEvent } from "utils/functions";
import Columns from "components/system/Files/FileManager/Columns";
import { useSession } from "contexts/session";

const StatusBar = dynamic(
  () => import("components/system/Files/FileManager/StatusBar")
);

const StyledEmpty = dynamic(
  () => import("components/system/Files/FileManager/StyledEmpty")
);

const StyledLoading = dynamic(
  () => import("components/system/Files/FileManager/StyledLoading")
);

type FileManagerProps = {
  allowMovingDraggableEntries?: boolean;
  hideFolders?: boolean;
  hideLoading?: boolean;
  hideScrolling?: boolean;
  hideShortcutIcons?: boolean;
  id?: string;
  isDesktop?: boolean;
  isStartMenu?: boolean;
  loadIconsImmediately?: boolean;
  readOnly?: boolean;
  showStatusBar?: boolean;
  skipFsWatcher?: boolean;
  skipSorting?: boolean;
  url: string;
};

const DEFAULT_VIEW = "icon";

const FileManager: FC<FileManagerProps> = ({
  allowMovingDraggableEntries,
  hideFolders,
  hideLoading,
  hideScrolling,
  hideShortcutIcons,
  id,
  isDesktop,
  isStartMenu,
  loadIconsImmediately,
  readOnly,
  showStatusBar,
  skipFsWatcher,
  skipSorting,
  url,
}) => {
  const { views, setViews } = useSession();
  const view = useMemo(() => {
    if (isDesktop) return "icon";
    if (isStartMenu) return "list";

    return views[url] || DEFAULT_VIEW;
  }, [isDesktop, isStartMenu, url, views]);
  const isDetailsView = useMemo(() => view === "details", [view]);
  const [columns, setColumns] = useState<ColumnsObject | undefined>(() =>
    isDetailsView ? DEFAULT_COLUMNS : undefined
  );
  const [currentUrl, setCurrentUrl] = useState(url);
  const [renaming, setRenaming] = useState("");
  const [mounted, setMounted] = useState<boolean>(false);
  const fileManagerRef = useRef<HTMLOListElement | null>(null);
  const { focusedEntries, focusableEntry, ...focusFunctions } =
    useFocusableEntries(fileManagerRef);
  const { fileActions, files, folderActions, isLoading, updateFiles } =
    useFolder(url, setRenaming, focusFunctions, {
      hideFolders,
      hideLoading,
      skipFsWatcher,
      skipSorting,
    });
  const { lstat, mountFs, rootFs } = useFileSystem();
  const { StyledFileEntry, StyledFileManager } = FileManagerViews[view];
  const { isSelecting, selectionRect, selectionStyling, selectionEvents } =
    useSelection(fileManagerRef, focusedEntries, focusFunctions, isDesktop);
  const draggableEntry = useDraggableEntries(
    focusedEntries,
    focusFunctions,
    fileManagerRef,
    isSelecting,
    allowMovingDraggableEntries
  );
  const fileDrop = useFileDrop({
    callback: folderActions.newPath,
    directory: url,
    updatePositions: allowMovingDraggableEntries,
  });
  const folderContextMenu = useFolderContextMenu(
    url,
    folderActions,
    isDesktop,
    isStartMenu
  );
  const loading = (!hideLoading && isLoading) || url !== currentUrl;
  const setView = useCallback(
    (newView: FileManagerViewNames) => {
      setViews((currentViews) => ({ ...currentViews, [url]: newView }));
      setColumns(newView === "details" ? DEFAULT_COLUMNS : undefined);
    },
    [setViews, url]
  );
  const keyShortcuts = useFileKeyboardShortcuts(
    files,
    url,
    focusedEntries,
    setRenaming,
    focusFunctions,
    folderActions,
    updateFiles,
    fileManagerRef,
    id,
    isStartMenu,
    isDesktop,
    setView
  );
  const [permission, setPermission] = useState<PermissionState>("prompt");
  const requestingPermissions = useRef(false);
  const focusedOnLoad = useRef(false);
  const onKeyDown = useMemo(
    () => (renaming === "" ? keyShortcuts() : undefined),
    [keyShortcuts, renaming]
  );
  const fileKeys = useMemo(() => Object.keys(files), [files]);
  const isEmptyFolder =
    !isDesktop &&
    !isStartMenu &&
    !loading &&
    view !== "list" &&
    fileKeys.length === 0;

  useEffect(() => {
    if (
      !requestingPermissions.current &&
      permission !== "granted" &&
      rootFs?.mntMap[currentUrl]?.getName() === "FileSystemAccess"
    ) {
      requestingPermissions.current = true;

      import("contexts/fileSystem/functions").then(({ requestPermission }) =>
        requestPermission(currentUrl)
          .then((permissions) => {
            const isGranted = permissions === "granted";

            if (!permissions || isGranted) {
              setPermission("granted");

              if (isGranted) updateFiles();
            }
          })
          .catch((error: Error) => {
            if (error?.message === "Permission already granted") {
              setPermission("granted");
            }
          })
          .finally(() => {
            requestingPermissions.current = false;
          })
      );
    }
  }, [currentUrl, permission, rootFs?.mntMap, updateFiles]);

  useEffect(() => {
    if (!mounted && MOUNTABLE_EXTENSIONS.has(getExtension(url))) {
      const mountUrl = async (): Promise<void> => {
        if (!(await lstat(url)).isDirectory()) {
          setMounted((currentlyMounted) => {
            if (!currentlyMounted) {
              mountFs(url)
                .then(() => setTimeout(updateFiles, 100))
                .catch(() => {
                  // Ignore race-condtion failures
                });
            }
            return true;
          });
        }
      };

      mountUrl();
    }
  }, [lstat, mountFs, mounted, updateFiles, url]);

  useEffect(() => {
    if (url !== currentUrl) {
      folderActions.resetFiles();
      setCurrentUrl(url);
      setPermission("denied");
    }
  }, [currentUrl, folderActions, url]);

  useEffect(() => {
    if (!focusedOnLoad.current && !loading && !isDesktop && !isStartMenu) {
      fileManagerRef.current?.focus(PREVENT_SCROLL);
      focusedOnLoad.current = true;
    }
  }, [isDesktop, isStartMenu, loading]);

  useEffect(() => {
    setColumns(isDetailsView ? DEFAULT_COLUMNS : undefined);
  }, [isDetailsView]);

  return (
    <>
      {loading ? (
        <StyledLoading />
      ) : (
        <>
          {isEmptyFolder && <StyledEmpty />}
          <StyledFileManager
            ref={fileManagerRef}
            $isEmptyFolder={isEmptyFolder}
            $scrollable={!hideScrolling}
            onKeyDown={onKeyDown}
            {...(readOnly
              ? { onContextMenu: haltEvent }
              : {
                  $selecting: isSelecting,
                  ...fileDrop,
                  ...folderContextMenu,
                  ...selectionEvents,
                })}
            {...FOCUSABLE_ELEMENT}
          >
            {isDetailsView && columns && (
              <Columns
                columns={columns}
                directory={url}
                files={files}
                setColumns={setColumns}
              />
            )}
            {isSelecting && <StyledSelection style={selectionStyling} />}
            {fileKeys.map((file) => (
              <StyledFileEntry
                key={file}
                $desktop={isDesktop}
                $selecting={isSelecting}
                $visible={!isLoading}
                {...(!readOnly && draggableEntry(url, file, renaming === file))}
                {...(renaming === "" && { onKeyDown: keyShortcuts(file) })}
                {...focusableEntry(file)}
              >
                <FileEntry
                    columns={columns}
                    fileActions={fileActions}
                    fileManagerId={id}
                    fileManagerRef={fileManagerRef}
                    focusFunctions={focusFunctions}
                    focusedEntries={focusedEntries}
                    hasNewFolderIcon={isStartMenu}
                    hideShortcutIcon={hideShortcutIcons}
                    isDesktop={isDesktop}
                    isHeading={isDesktop && files[file].systemShortcut}
                    isLoadingFileManager={isLoading}
                    loadIconImmediately={loadIconsImmediately}
                    name={basename(file, SHORTCUT_EXTENSION)}
                    path={join(url, file)}
                    readOnly={readOnly}
                    renaming={renaming === file}
                    selectionRect={selectionRect}
                    setRenaming={setRenaming}
                    stats={files[file]}
                    view={view}
                  />
              </StyledFileEntry>
            ))}
          </StyledFileManager>
        </>
      )}
      {showStatusBar && (
        <StatusBar
          count={loading ? 0 : fileKeys.length}
          directory={url}
          fileDrop={fileDrop}
          selected={focusedEntries}
          setView={setView}
          view={view}
        />
      )}
    </>
  );
};

export default memo(FileManager);
