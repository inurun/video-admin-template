import { useAutoSaveProject } from "@/app/features/editor/lib/use-auto-save-project";
import { useSyncProjectSynthesis } from "@/app/features/editor/lib/use-sync-project-synthesis";
import type { ReactNode } from "react";
import { SidebarInset } from "@/app/components/ui/sidebar";
import { AppSidebar } from "@/app/components/app-sidebar/app-sidebar";
import { AppEditor } from "@/app/components/app-editor/app-editor";
import { ProjectContextProvider } from "@/app/features/project";
import { ProjectRouteProvider } from "@/app/features/project/context/project-route-context";
import { RenderContextProvider } from "@/app/features/render";
import { PublishContextProvider } from "@/app/features/publish";
import { SettingsContextProvider } from "@/app/features/settings";
import { EditorSessionStoreProvider, SavedProjectStoreProvider } from "@/app/features/editor";
import { useSelectedProjectQuery } from "@/app/features/project/swr/use-project-queries";
import { useProjectRoute } from "@/app/features/project/context/project-route-context";
import {
  isDictionaryRoute,
  isG2pReviewRoute,
  isSchedulesRoute,
} from "@/app/features/project/lib/project-route";
import { AppDictionary } from "@/app/components/app-dictionary/app-dictionary";
import { AppG2pReview } from "@/app/components/app-g2p-review/app-g2p-review";
import { AppHeader } from "../components/app-header/app-header";
import { AppSchedule } from "../components/app-schedule/app-schedule";
import { VideoPlayerControlProvider } from "@/app/features/video-player/context/video-player-control-context";

function ProjectSync() {
  useAutoSaveProject();
  useSyncProjectSynthesis();
  return null;
}

function ProjectStores({ children }: { children: ReactNode }) {
  const { projectPath } = useProjectRoute();
  const { project, timeline, hasData } = useSelectedProjectQuery(projectPath);

  return (
    <SavedProjectStoreProvider
      key={`${projectPath ?? "none"}:${hasData ? "ready" : "empty"}`}
      initialProject={project}
      initialTimeline={timeline}
    >
      <EditorSessionStoreProvider
        key={`${projectPath ?? "none"}:${hasData ? "ready" : "empty"}`}
        initialProject={project}
      >
        <ProjectSync />
        {children}
      </EditorSessionStoreProvider>
    </SavedProjectStoreProvider>
  );
}

function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsContextProvider>
      <ProjectRouteProvider>
        <ProjectContextProvider>
          <ProjectStores>
            <PublishContextProvider>
              <RenderContextProvider>{children}</RenderContextProvider>
            </PublishContextProvider>
          </ProjectStores>
        </ProjectContextProvider>
      </ProjectRouteProvider>
    </SettingsContextProvider>
  );
}

function AppMain() {
  const { route } = useProjectRoute();

  if (isSchedulesRoute(route)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <AppSchedule />
      </div>
    );
  }
  if (isDictionaryRoute(route)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppDictionary />
      </div>
    );
  }
  if (isG2pReviewRoute(route)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppG2pReview />
      </div>
    );
  }

  return (
    <VideoPlayerControlProvider>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <AppHeader />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <AppEditor />
        </div>
      </div>
    </VideoPlayerControlProvider>
  );
}

export default function App() {
  return (
    <AppProviders>
      <AppSidebar>
        <SidebarInset className="min-h-0 overflow-hidden md:max-h-[calc(100svh-1rem)]">
          <main className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-2 overflow-hidden p-2">
            <AppMain />
          </main>
        </SidebarInset>
      </AppSidebar>
    </AppProviders>
  );
}
