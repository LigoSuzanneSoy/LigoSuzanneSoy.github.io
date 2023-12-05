#!/usr/bin/env bash

set -euET -o pipefail

convert -background none favicon.png -define icon:auto-resize=64,48,32,16 favicon.ico
./snippets.py
