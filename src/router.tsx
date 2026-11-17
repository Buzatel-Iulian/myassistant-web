import { createBrowserRouter, Navigate } from "react-router";

import { RouteError } from "@/components/common/RouteError";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppSkeleton, RequireAuth } from "@/components/layout/RequireAuth";
import { LoginPage } from "@/pages/LoginPage";

// Every page but the login is loaded when its route is first opened (route-level code splitting): the first screen a
// visitor sees needs only the layout and the login form, and the management pages are not downloaded by someone who
// only chats. The login page stays in the main bundle because it is the first page of every new session.
export const router = createBrowserRouter([
  {
    // A pathless root, only to give every page the same readable error screen.
    errorElement: <RouteError />,
    // Shown while the first page's lazy chunk loads (React Router warns without one).
    hydrateFallbackElement: <AppSkeleton />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/register", lazy: async () => ({ Component: (await import("@/pages/RegisterPage")).RegisterPage }) },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { index: true, element: <Navigate to="/chat" replace /> },
              {
                path: "chat/:configId?",
                lazy: async () => ({ Component: (await import("@/pages/ChatPage")).ChatPage })
              },
              {
                path: "assistants",
                lazy: async () => ({ Component: (await import("@/pages/AssistantsPage")).AssistantsPage })
              },
              // "new" and an id share one route: the page tells them apart.
              {
                path: "assistants/:configId",
                lazy: async () => ({ Component: (await import("@/pages/AssistantEditPage")).AssistantEditPage })
              },
              {
                path: "templates",
                lazy: async () => ({ Component: (await import("@/pages/TemplatesPage")).TemplatesPage })
              },
              {
                path: "templates/:templateId",
                lazy: async () => ({ Component: (await import("@/pages/TemplateEditPage")).TemplateEditPage })
              }
            ]
          }
        ]
      },
      // nginx answers every unknown path with index.html, so an unknown route lands here instead of a 404 page.
      { path: "*", element: <Navigate to="/chat" replace /> }
    ]
  }
]);
