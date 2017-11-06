#!/bin/bash
set -x
docker-compose run --rm search -p 9090 -d /index_dir/ --fh fetch --fp 9090 --build-index --batch 10
