import { Routes, Route, useLocation, useParams } from "react-router-dom";
import { Card, Layout, Menu, Button } from "antd";
// skipcq: JS-C1003
import * as dcmjs from "dcmjs";
import { useEffect, useState } from "react";
import * as dmv from "dicom-microscopy-viewer";

import { AnnotationSettings } from "../AppConfig";
import ClinicalTrial from "./ClinicalTrial";
import DicomWebManager from "../DicomWebManager";
import Patient from "./Patient";
import Study from "./Study";
import SlideList from "./SlideList";
import SlideViewer from "./SlideViewer";
import { FaRegClone } from "react-icons/fa";

import { User } from "../auth";
import { Slide } from "../data/slides";
import { RouteComponentProps, withRouter } from "../utils/router";
import { useSlides } from "../hooks/useSlides";
import { StorageClasses } from "../data/uids";
const { naturalizeDataset } = dcmjs.data.DicomMetaDictionary;

interface NaturalizedInstance {
  SeriesInstanceUID: string;
  SeriesNumber?: number;
  Modality?: string;
  InstanceNumber?: number;
  SeriesDescription?: string;
  SOPInstanceUID: string;
  ReferencedSeriesSequence?: Array<{
    SeriesInstanceUID: string;
  }>;
  ContentSequence?: Array<{
    ConceptNameCodeSequence: Array<{
      CodeValue: string;
    }>;
    ContentSequence?: Array<{
      ContentSequence: Array<{
        ReferencedSOPSequence: Array<{
          ReferencedSOPInstanceUID: string;
        }>;
      }>;
    }>;
  }>;
}

interface ReferencedSlideResult {
  slide: Slide | undefined;
  metadata: NaturalizedInstance;
}

const findSeriesSlide = (
  slides: Slide[],
  seriesInstanceUID: string
): Slide | undefined => {
  return slides.find((slide: Slide) => {
    return slide.seriesInstanceUIDs.find((uid: string) => {
      return uid === seriesInstanceUID;
    });
  });
};

function ParametrizedSlideViewer({
  clients,
  slides,
  user,
  app,
  preload,
  enableAnnotationTools,
  annotations,
}: {
  clients: { [key: string]: DicomWebManager };
  slides: Slide[];
  user?: User;
  app: {
    name: string;
    version: string;
    uid: string;
    organization?: string;
  };
  preload: boolean;
  enableAnnotationTools: boolean;
  annotations: AnnotationSettings[];
}): JSX.Element | null {
  const { studyInstanceUID = "", seriesInstanceUID = "" } = useParams<{
    studyInstanceUID: string;
    seriesInstanceUID: string;
  }>();
  const location = useLocation();

  const [selectedSlide, setSelectedSlide] = useState(
    findSeriesSlide(slides, seriesInstanceUID)
  );
  const [derivedDataset, setDerivedDataset] =
    useState<NaturalizedInstance | null>(null);

  useEffect(() => {
    const seriesSlide = findSeriesSlide(slides, seriesInstanceUID);
    if (seriesSlide !== null) {
      setSelectedSlide(seriesSlide);
    }
  }, [seriesInstanceUID, slides]);

  useEffect(() => {
    const findReferencedSlide = async ({
      clients,
      studyInstanceUID,
      seriesInstanceUID,
    }: {
      clients: { [key: string]: DicomWebManager };
      studyInstanceUID: string;
      seriesInstanceUID: string;
    }): Promise<ReferencedSlideResult | null> =>
      await new Promise<ReferencedSlideResult | null>((resolve, reject) => {
        try {
          const allClients = Object.values(StorageClasses).map(
            (storageClass) => clients[storageClass]
          );
          Promise.all(
            allClients.map(async (client) => {
              const seriesMetadata = await client.retrieveSeriesMetadata({
                studyInstanceUID: studyInstanceUID,
                seriesInstanceUID: seriesInstanceUID,
              });
              const [naturalizedSeriesMetadata] = seriesMetadata.map(
                (metadata) => naturalizeDataset(metadata)
              ) as NaturalizedInstance[];

              if (naturalizedSeriesMetadata.ReferencedSeriesSequence != null) {
                const referencedSeriesInstanceUID =
                  naturalizedSeriesMetadata.ReferencedSeriesSequence[0]
                    .SeriesInstanceUID;
                const referencedSlide = slides.find((slide: Slide) => {
                  return slide.seriesInstanceUIDs.find((uid: string) => {
                    return uid === referencedSeriesInstanceUID;
                  });
                });
                resolve({
                  slide: referencedSlide,
                  metadata: naturalizedSeriesMetadata,
                });
              }

              const IMAGE_LIBRARY_CONCEPT_NAME_CODE = "111028";
              const imageLibrary =
                naturalizedSeriesMetadata.ContentSequence?.find(
                  (contentItem) =>
                    contentItem.ConceptNameCodeSequence[0].CodeValue ===
                    IMAGE_LIBRARY_CONCEPT_NAME_CODE
                );
              if (
                imageLibrary?.ContentSequence?.[0]?.ContentSequence?.[0]
                  ?.ReferencedSOPSequence?.[0] != null
              ) {
                const referencedSOPInstanceUID =
                  imageLibrary.ContentSequence[0].ContentSequence[0]
                    .ReferencedSOPSequence[0].ReferencedSOPInstanceUID;
                const referencedSlide = slides.find((slide: Slide) => {
                  return slide.volumeImages.find(
                    (image: { SOPInstanceUID: string }) => {
                      return image.SOPInstanceUID === referencedSOPInstanceUID;
                    }
                  );
                });
                resolve({
                  slide: referencedSlide,
                  metadata: naturalizedSeriesMetadata,
                });
              }
            })
          ).catch(reject);
        } catch (error) {
          reject(error);
        }
      });

    if (selectedSlide === null || selectedSlide === undefined) {
      void findReferencedSlide({ clients, studyInstanceUID, seriesInstanceUID })
        .then((result: ReferencedSlideResult | null) => {
          if (result !== null && result !== undefined) {
            setSelectedSlide(result.slide);
            setDerivedDataset(result.metadata);
          }
        })
        .catch((error) => {
          console.error("Error finding referenced slide:", error);
        });
    }
  }, [slides, clients, studyInstanceUID, seriesInstanceUID, selectedSlide]);

  const searchParams = new URLSearchParams(location.search);
  let presentationStateUID: string | undefined;
  if (!searchParams.has("access_token")) {
    const stateParam = searchParams.get("state");
    presentationStateUID = stateParam !== null ? stateParam : undefined;
  }

  let viewer = null;
  if (selectedSlide != null && selectedSlide !== undefined) {
    viewer = (
      <SlideViewer
        clients={clients}
        studyInstanceUID={studyInstanceUID}
        seriesInstanceUID={seriesInstanceUID}
        selectedPresentationStateUID={presentationStateUID}
        slide={selectedSlide}
        preload={preload}
        annotations={annotations}
        enableAnnotationTools={enableAnnotationTools}
        app={app}
        user={user}
        derivedDataset={derivedDataset ?? undefined}
      />
    );
  }
  return viewer;
}

interface ViewerProps extends RouteComponentProps {
  clients: { [key: string]: DicomWebManager };
  studyInstanceUID: string;
  app: {
    name: string;
    version: string;
    uid: string;
    organization?: string;
  };
  annotations: AnnotationSettings[];
  enableAnnotationTools: boolean;
  preload: boolean;
  user?: {
    name: string;
    email: string;
  };
}

function Viewer(props: ViewerProps): JSX.Element | null {
  const { clients, studyInstanceUID, location, navigate } = props;
  const { slides, isLoading } = useSlides({ clients, studyInstanceUID });
  const [srInstances, setSrInstances] = useState<NaturalizedInstance[]>([]);
  const [selectedSr, setSelectedSr] = useState<NaturalizedInstance | null>(
    null
  );
  const [showSrMode, setShowSrMode] = useState(false);

  const handleSeriesSelection = ({
    seriesInstanceUID,
  }: {
    seriesInstanceUID: string;
  }): void => {
    console.info(`switch to series "${seriesInstanceUID}"`);
    let urlPath =
      `/studies/${studyInstanceUID}` + `/series/${seriesInstanceUID}`;

    if (location.pathname.includes("/projects/")) {
      urlPath = location.pathname;
      if (!location.pathname.includes("/series/")) {
        urlPath += `/series/${seriesInstanceUID}`;
      } else {
        urlPath = urlPath.replace(
          /\/series\/[^/]+/,
          `/series/${seriesInstanceUID}`
        );
      }
    }

    if (location.pathname.includes("/series/") && location.search != null) {
      urlPath += location.search;
    }
    navigate(urlPath, { replace: true });
  };

  function SRTextReport({
    sr,
    onBack,
  }: {
    sr: NaturalizedInstance;
    onBack: () => void;
  }) {
    if (!sr.ContentSequence) return <div>No SR report content.</div>;
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{ display: "flex", alignItems: "center", marginBottom: 24 }}
        >
          <h1 style={{ margin: 0, flex: 1 }}>Image Label/Diagnoses Report</h1>
          <Button type="primary" onClick={onBack}>
            Back to Image
          </Button>
        </div>
        <SRTree tree={sr.ContentSequence} />
      </div>
    );
  }

  function SRTree({ tree }: { tree: any[] }) {
    return (
      <ul>
        {tree.map((item, idx) => (
          <li key={idx}>
            <b>
              {item.ConceptNameCodeSequence?.[0]?.CodeMeaning ??
                "Unknown Field"}
              :
            </b>{" "}
            {item.TextValue ?? item.NumericValue ?? ""}
            {item.ContentSequence && <SRTree tree={item.ContentSequence} />}
          </li>
        ))}
      </ul>
    );
  }

  useEffect(() => {
    async function fetchSRInstances() {
      try {
        console.info("search for Comprehensive 2D SR instances");
        const client = clients[StorageClasses.COMPREHENSIVE_SR];
        const matchedInstances = await client.searchForInstances({
          studyInstanceUID: studyInstanceUID,
          queryParams: { Modality: "SR" },
        });
        const safeInstances = matchedInstances || [];

        // Fetch the full content of all matched instances
        const detailedInstances = await Promise.all(
          safeInstances.map(async (i) => {
            const { dataset } = dmv.metadata.formatMetadata(i);
            const instance = dataset as dmv.metadata.Instance;
            if (instance.SOPClassUID === StorageClasses.COMPREHENSIVE_SR) {
              console.info(
                `retrieve 2D SR instance "${instance.SOPInstanceUID}"`
              );
              const retrievedInstance = await client.retrieveInstance({
                studyInstanceUID: studyInstanceUID,
                seriesInstanceUID: instance.SeriesInstanceUID,
                sopInstanceUID: instance.SOPInstanceUID,
              });
              const data = dcmjs.data.DicomMessage.readFile(retrievedInstance);

              const { dataset: dcmDataset } = dmv.metadata.formatMetadata(
                data.dict
              );

              return dcmDataset;
            }
            return null;
          })
        );

        // Filter any null or undefined instances out
        const filteredInstances = detailedInstances.filter(
          Boolean
        ) as NaturalizedInstance[];

        setSrInstances(filteredInstances);
      } catch (error) {
        console.error("Failed to fetch SR instances", error);
      }
    }
    fetchSRInstances();
  }, [clients, studyInstanceUID]);

  if (isLoading) {
    return null;
  }

  if (slides.length === 0) {
    return null;
  }

  const firstSlide = slides[0];
  const volumeInstances = firstSlide.volumeImages;
  if (volumeInstances.length === 0) {
    return null;
  }
  const refImage = volumeInstances[0];

  /* If a series is encoded in the path, route the viewer to this series.
   * Otherwise select the first series correspondent to
   * the first slide contained in the study.
   */
  let selectedSeriesInstanceUID: string;
  if (location.pathname.includes("series/")) {
    const seriesFragment = location.pathname.split("series/")[1];
    selectedSeriesInstanceUID = seriesFragment.includes("/")
      ? seriesFragment.split("/")[0]
      : seriesFragment;
  } else {
    selectedSeriesInstanceUID = volumeInstances[0].SeriesInstanceUID;
  }

  let clinicalTrialMenu;
  if (refImage.ClinicalTrialSponsorName != null) {
    clinicalTrialMenu = (
      <Menu.SubMenu key="clinical-trial" title="Clinical Trial">
        <ClinicalTrial metadata={refImage} />
      </Menu.SubMenu>
    );
  }
  console.log("srInstances", srInstances);

  return (
    <Layout style={{ height: "100%" }} hasSider>
      <Layout.Sider
        width={300}
        style={{
          height: "100%",
          borderRight: "solid",
          borderRightWidth: 0.25,
          overflow: "hidden",
          background: "none",
        }}
      >
        <Menu
          mode="inline"
          defaultOpenKeys={["patient", "study", "clinical-trial", "slides"]}
          style={{ height: "100%" }}
          inlineIndent={14}
        >
          <Menu.SubMenu key="patient" title="Patient">
            <Patient metadata={refImage} />
          </Menu.SubMenu>
          <Menu.SubMenu key="study" title="Study">
            <Study metadata={refImage} />
          </Menu.SubMenu>
          {clinicalTrialMenu}

          {/* commented out this menu item as it is of no use for us */}
          {/* <Menu.SubMenu key="slides" title="Slides">
            <SlideList
              clients={props.clients}
              metadata={slides}
              selectedSeriesInstanceUID={selectedSeriesInstanceUID}
              onSeriesSelection={handleSeriesSelection}
            />
          </Menu.SubMenu> */}

          <Menu.SubMenu key="imageLabel" title="Image Labels">
            {srInstances.map((sr) => (
              <Card
                key={sr.SOPInstanceUID}
                style={{ marginBottom: 8, cursor: "pointer" }}
                onClick={() => {
                  setSelectedSr(sr);
                  setShowSrMode(true);
                }}
                title={`SR ${sr.SeriesDescription}`}
                size="small"
              >
                <div>
                  <span>
                    <b>S:</b> {sr.SeriesNumber}
                  </span>
                  <span style={{ marginInlineStart: 12 }}>
                    <FaRegClone /> {sr.InstanceNumber}
                  </span>
                </div>
              </Card>
            ))}
          </Menu.SubMenu>
        </Menu>
      </Layout.Sider>

      <Layout.Content style={{ padding: 24, minHeight: 600 }}>
        {showSrMode && selectedSr ? (
          <SRTextReport sr={selectedSr} onBack={() => setShowSrMode(false)} />
        ) : (
          <Routes>
            <Route
              path="/series/:seriesInstanceUID"
              element={
                <ParametrizedSlideViewer
                  clients={props.clients}
                  slides={slides}
                  preload={props.preload}
                  annotations={props.annotations}
                  enableAnnotationTools={props.enableAnnotationTools}
                  app={props.app}
                  user={props.user}
                />
              }
            />
          </Routes>
        )}
      </Layout.Content>
    </Layout>
  );
}

export default withRouter(Viewer);
