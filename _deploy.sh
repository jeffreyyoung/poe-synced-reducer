sh ./_build.sh
git add -A
git commit -m "deploy"
git push


echo "https://www.val.town/x/jeffreyyoung/synced_reducer/code/main.tsx"

CURRENT_COMMIT=$(git rev-parse HEAD)
echo "latest commit: $CURRENT_COMMIT"