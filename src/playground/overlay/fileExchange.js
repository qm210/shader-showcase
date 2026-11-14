export function downloadJson(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
        new Blob([json], {type: 'application/json'})
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export function pickJsonFile() {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = () => {
            const [file] = input.files;
            if (!file) {
                return;
            }
            file.text()
                .then(text => resolve(JSON.parse(text)))
                .catch(reject);
        };
        input.click();
    });
}
