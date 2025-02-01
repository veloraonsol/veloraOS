import { memo, useRef } from "react";
import { useTheme } from "styled-components";
import { sortFiles } from "components/system/Files/FileManager/functions";
import { type SortBy } from "components/system/Files/FileManager/useSortBy";
import StyledColumns from "components/system/Files/FileManager/Columns/StyledColumns";
import {
  DEFAULT_COLUMN_ORDER,
  MAX_STEPS_PER_RESIZE,
  type ColumnName,
  type Columns as ColumnsObject,
} from "components/system/Files/FileManager/Columns/constants";
import { useSession } from "contexts/session";
import { type Files } from "components/system/Files/FileManager/useFolder";
import { Down } from "components/apps/FileExplorer/NavigationIcons";

type ColumnsProps = {
  columns: ColumnsObject;
  directory: string;
  files: Files;
  setColumns: React.Dispatch<React.SetStateAction<ColumnsObject | undefined>>;
};

const Columns: FC<ColumnsProps> = ({
  columns,
  directory,
  files,
  setColumns,
}) => {
  const { sizes } = useTheme();
  const draggingRef = useRef("");
  const lastClientX = useRef(0);
  const { setSortOrder, sortOrders } = useSession();
  const [, sortedBy = "name", ascending] = sortOrders[directory] ?? [];

  return (
    <StyledColumns>
      <ol>
        {DEFAULT_COLUMN_ORDER.map((name) => (
          <li
            key={columns[name].name}
            onPointerDownCapture={(event) => {
              if (event.button !== 0) return;

              draggingRef.current =
                (event.target as HTMLElement).className === "resize"
                  ? name
                  : "";
              lastClientX.current = event.clientX;
            }}
            onPointerMoveCapture={(event) => {
              if (draggingRef.current) {
                const dragName = draggingRef.current as ColumnName;

                setColumns((currentColumns) => {
                  if (!currentColumns?.[dragName]) return currentColumns;

                  const newColumns = { ...currentColumns };
                  const newSize =
                    newColumns[dragName].width +
                    event.clientX -
                    lastClientX.current;

                  if (
                    newSize < sizes.fileManager.columnMinWidth ||
                    Math.abs(lastClientX.current - event.clientX) >
                      MAX_STEPS_PER_RESIZE
                  ) {
                    return newColumns;
                  }

                  newColumns[dragName].width = newSize;
                  lastClientX.current = event.clientX;

                  return newColumns;
                });
              }
            }}
            onPointerUpCapture={(event) => {
              if (event.button !== 0) return;

              if (draggingRef.current) {
                draggingRef.current = "";
                lastClientX.current = 0;
              } else {
                const sortBy = name as SortBy;

                setSortOrder(
                  directory,
                  Object.keys(sortFiles(directory, files, sortBy, !ascending)),
                  sortBy,
                  !ascending
                );
              }
            }}
            style={{ width: `${columns[name].width}px` }}
          >
            {sortedBy === name && <Down flip={ascending} />}
            <div className="name">{columns[name].name}</div>
            <span className="resize" />
          </li>
        ))}
      </ol>
    </StyledColumns>
  );
};

export default memo(Columns);
