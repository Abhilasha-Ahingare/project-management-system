export const mergeSceneElements = (remoteElements = [], localElements = []) => {
  const merged = new Map(
    remoteElements.map((element) => [element.id, element]),
  );
  let hasLocalChanges = false;

  for (const localElement of localElements) {
    const remoteElement = merged.get(localElement.id);
    if (!remoteElement) {
      merged.set(localElement.id, localElement);
      hasLocalChanges = true;
    } else if ((localElement.version || 0) > (remoteElement.version || 0)) {
      merged.set(localElement.id, localElement);
      hasLocalChanges = true;
    }
  }

  return { elements: [...merged.values()], hasLocalChanges };
};
