Simple Search Demo
------------------

This repo contains a `Dockerfile` for a simple web-based UI for
querying a Concrete SearchService server.

The repo also contains a `docker-compose.yml` file for standing up:

  - the web based UI on port 8080
  - a FetchCommunicationService on port 9090
  - a Lucene-based SearchService on port 9091

The `docker-compose.yml` file assumes that you have a Zip archive in
the current directory named `comms.zip` that contains the
Concrete Communications you want to search.

Before you can search through the Communications, you must first index
them using the command:

    docker-compose -f docker-compose-build-index.yml run build-search-index.cmd

The indexing process can take a while.  On one relatively new laptop,
the process took roughly 10 minutes per GB of (uncompressed)
Communication files, but your mileage will vary.

Once the index has been created, you can stand up the search UI using
the command:

    docker-compose up

You should now be able to interact with the search UI by going to:

http://localhost:8080
