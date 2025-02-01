import { useRef } from "react";
import useWallpaper from "components/system/Desktop/Wallpapers/useWallpaper";
import StyledDesktop from "components/system/Desktop/StyledDesktop";
import FileManager from "components/system/Files/FileManager";
import { DESKTOP_PATH } from "utils/constants";

const Desktop: FC = ({ children }) => {
  const desktopRef = useRef<HTMLElement | null>(null);

  useWallpaper(desktopRef);

  return (
    <StyledDesktop ref={desktopRef}>
      <FileManager
        url={DESKTOP_PATH}
        allowMovingDraggableEntries
        hideLoading
        hideScrolling
        isDesktop
        loadIconsImmediately
      />
      {children}
    </StyledDesktop>
  );
};

export default Desktop;
