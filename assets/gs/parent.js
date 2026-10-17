// assets/gs/parent.js
// Parent corner. Stub so the page loads; Task 11 fills it.
export function mountParent(root, { onBack }) {
    root.innerHTML = '<header class="gs-top"><button type="button" class="gs-icon" id="parentBack" aria-label="Retour">‹</button></header>'
        + '<p class="gs-muted">Coin des parents (bientôt)</p>';
    root.querySelector('#parentBack').addEventListener('click', onBack);
}
