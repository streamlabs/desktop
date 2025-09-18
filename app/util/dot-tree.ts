export function convertDotNotationToTree(states: string[] | string): any {
  const tree: any = {};
  const stateArray = Array.isArray(states) ? states : [states];
  stateArray.forEach(state => {
    const parts = state.split('.');
    let current = tree;
    parts.forEach((part, index) => {
      if (!current[part]) {
        current[part] = index === parts.length - 1 ? true : {};
      }
      current = current[part];
    });
  });
  return tree;
}
