export async function selectWorkspaceFolder() {
  if (window.go?.main?.App?.SelectWorkspaceFolder) {
    return await window.go.main.App.SelectWorkspaceFolder();
  }
  return localStorage.getItem("esper_local_ws") || "/Users/local/Documents/EsperNotes";
}

export async function getCurrentWorkspace() {
  if (window.go?.main?.App?.GetCurrentWorkspace) {
    const [curr, recent] = await window.go.main.App.GetCurrentWorkspace();
    return { current: curr, recent: recent || [] };
  }
  const curr = localStorage.getItem("esper_local_ws") || "";
  return { current: curr, recent: [curr].filter(Boolean) };
}

export async function setCurrentWorkspace(path) {
  if (window.go?.main?.App?.SetCurrentWorkspace) {
    return await window.go.main.App.SetCurrentWorkspace(path);
  }
  localStorage.setItem("esper_local_ws", path);
}

export async function listNotebooks() {
  if (window.go?.main?.App?.ListNotebooks) {
    const raws = await window.go.main.App.ListNotebooks();
    return raws.map((r) => JSON.parse(r));
  }
  const raw = localStorage.getItem("esper_mock_docs");
  return raw ? JSON.parse(raw) : [];
}

export async function saveNotebook(doc) {
  const jsonStr = JSON.stringify(doc, null, 2);
  if (window.go?.main?.App?.SaveNotebook) {
    return await window.go.main.App.SaveNotebook(doc.id, jsonStr);
  }
  const list = await listNotebooks();
  const next = [...list.filter((d) => d.id !== doc.id), doc];
  localStorage.setItem("esper_mock_docs", JSON.stringify(next));
}

export async function deleteNotebook(id) {
  if (window.go?.main?.App?.DeleteNotebook) {
    return await window.go.main.App.DeleteNotebook(id);
  }
  const list = await listNotebooks();
  localStorage.setItem("esper_mock_docs", JSON.stringify(list.filter((d) => d.id !== id)));
}
